import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as QueriesModule from "./openSerpQueries";

// Real in-memory SQLite: the caps are enforced by SQL, so test them there.
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let q: typeof QueriesModule;
const NOW = new Date("2026-11-12T09:30:00.000Z");

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/runBatch", () => ({
    DB_BATCH_SIZE: 100,
    executeInBatches: vi.fn(),
  }));
  await client.executeMultiple(`
    CREATE TABLE open_serp_usage (
      project_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, usage_date)
    );
  `);
  q = await import("./openSerpQueries");
});

afterAll(() => client.close());
beforeEach(async () => {
  await client.execute("DELETE FROM open_serp_usage");
});

const limits = (over: Partial<QueriesModule.SerpApiLimits> = {}) => ({
  daily: 8,
  monthly: 250,
  hourly: 50,
  ...over,
});

describe("reserveSerpApiRequest", () => {
  it("allows exactly the daily cap per project, then refuses", async () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(
        await q.reserveSerpApiRequest("p1", limits({ daily: 3 }), NOW),
      );
    }
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "daily" });
    // A refusal must not leak counts into the account counters.
    expect(await q.getSerpApiUsage("p1", NOW)).toEqual({
      day: 3,
      month: 3,
      hour: 3,
    });
  });

  it("never exceeds the cap under parallel reservations (atomic)", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        q.reserveSerpApiRequest("p1", limits({ daily: 5 }), NOW),
      ),
    );
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(5);
    const usage = await q.getSerpApiUsage("p1", NOW);
    expect(usage.day).toBeLessThanOrEqual(5);
    expect(usage.month).toBe(results.filter((r) => r.ok).length);
  });

  it("never exceeds the monthly or hourly account caps under parallel reservations across projects", async () => {
    const monthly = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        q.reserveSerpApiRequest(
          `p${i % 3}`,
          limits({ daily: 100, monthly: 7 }),
          NOW,
        ),
      ),
    );
    expect(monthly.filter((r) => r.ok).length).toBeLessThanOrEqual(7);
    await client.execute("DELETE FROM open_serp_usage");
    const hourly = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        q.reserveSerpApiRequest(
          `p${i % 3}`,
          limits({ daily: 100, hourly: 4 }),
          NOW,
        ),
      ),
    );
    expect(hourly.filter((r) => r.ok).length).toBeLessThanOrEqual(4);
    const total = Number(
      (
        await client.execute(
          "SELECT COALESCE(SUM(requests),0) AS t FROM open_serp_usage WHERE usage_date LIKE 'serpapi:h:%'",
        )
      ).rows[0].t,
    );
    expect(total).toBeLessThanOrEqual(4);
  });

  it("applies the monthly cap across projects (the free plan is per account)", async () => {
    const cap = limits({ monthly: 4, daily: 10 });
    expect((await q.reserveSerpApiRequest("a", cap, NOW)).ok).toBe(true);
    expect((await q.reserveSerpApiRequest("a", cap, NOW)).ok).toBe(true);
    expect((await q.reserveSerpApiRequest("b", cap, NOW)).ok).toBe(true);
    expect((await q.reserveSerpApiRequest("b", cap, NOW)).ok).toBe(true);
    expect(await q.reserveSerpApiRequest("c", cap, NOW)).toEqual({
      ok: false,
      reason: "monthly",
    });
  });

  it("resets the hour and day windows but not the month", async () => {
    const cap = limits({ hourly: 2, daily: 100, monthly: 100 });
    await q.reserveSerpApiRequest("p", cap, NOW);
    await q.reserveSerpApiRequest("p", cap, NOW);
    expect(await q.reserveSerpApiRequest("p", cap, NOW)).toEqual({
      ok: false,
      reason: "hourly",
    });
    const nextHour = new Date("2026-11-12T10:00:00.000Z");
    expect((await q.reserveSerpApiRequest("p", cap, nextHour)).ok).toBe(true);
    const nextDay = new Date("2026-11-13T09:30:00.000Z");
    expect((await q.reserveSerpApiRequest("p", cap, nextDay)).ok).toBe(true);
    expect((await q.getSerpApiUsage("p", nextDay)).month).toBe(4);
    const nextMonth = new Date("2026-12-01T00:00:00.000Z");
    expect((await q.getSerpApiUsage("p", nextMonth)).month).toBe(0);
  });

  it("gives a reservation back and never goes negative", async () => {
    const reservation = await q.reserveSerpApiRequest("p", limits(), NOW);
    if (!reservation.ok) throw new Error("expected ok");
    await q.releaseSerpApiRequest("p", reservation.keys);
    await q.releaseSerpApiRequest("p", reservation.keys);
    expect(await q.getSerpApiUsage("p", NOW)).toEqual({
      day: 0,
      month: 0,
      hour: 0,
    });
  });

  it("does not collide with the OpenSERP daily counter", async () => {
    await q.reserveOpenSerpRequest("p", 5, "2026-11-12");
    await q.reserveSerpApiRequest("p", limits(), NOW);
    expect((await q.getSerpApiUsage("p", NOW)).day).toBe(1);
  });
});
