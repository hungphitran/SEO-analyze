import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CRUX_HISTORY_ENDPOINT,
  CRUX_RECORD_ENDPOINT,
  CruxError,
  parseCruxHistory,
  parseCruxRecord,
  queryCruxHistory,
  queryCruxRecord,
} from "./crux";

const recordFixture = {
  record: {
    key: { origin: "https://example.com" },
    metrics: {
      largest_contentful_paint: {
        histogram: [
          { start: 0, end: 2500, density: 0.71234 },
          { start: 2500, end: 4000, density: 0.2 },
          { start: 4000, density: 0.08766 },
        ],
        percentiles: { p75: 2310.4 },
      },
      cumulative_layout_shift: {
        histogram: [
          { start: "0.00", end: "0.10", density: 0.9 },
          { start: "0.10", end: "0.25", density: 0.06 },
          { start: "0.25", density: 0.04 },
        ],
        percentiles: { p75: "0.05" },
      },
      interaction_to_next_paint: {
        histogram: [
          { start: 0, end: 200, density: 0.8 },
          { start: 200, end: 500, density: 0.15 },
          { start: 500, density: 0.05 },
        ],
        percentiles: { p75: 180 },
      },
    },
    collectionPeriod: {
      firstDate: { year: 2026, month: 10, day: 12 },
      lastDate: { year: 2026, month: 11, day: 8 },
    },
  },
};

const historyFixture = {
  record: {
    key: { origin: "https://example.com" },
    metrics: {
      largest_contentful_paint: {
        percentilesTimeseries: { p75s: [2400, null, 2200.6] },
      },
      cumulative_layout_shift: {
        percentilesTimeseries: { p75s: ["0.04", "NaN", "0.051"] },
      },
    },
    collectionPeriods: [
      { lastDate: { year: 2026, month: 10, day: 18 } },
      { lastDate: { year: 2026, month: 10, day: 25 } },
      { lastDate: { year: 2026, month: 11, day: 1 } },
    ],
  },
};

type FetchMock = { mock: { calls: unknown[][] } };

/** The URL, headers and parsed JSON body of the n-th recorded call. */
function sentRequest(fetchImpl: FetchMock, index = 0) {
  const [url, init] = fetchImpl.mock.calls[index] ?? [];
  const requestInit = z
    .object({ headers: z.unknown(), body: z.string() })
    .parse(init);
  return {
    url: String(url),
    headers: new Headers(
      z.record(z.string(), z.string()).parse(requestInit.headers),
    ),
    body: z.record(z.string(), z.unknown()).parse(JSON.parse(requestInit.body)),
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("parseCruxRecord", () => {
  it("maps p75, buckets and the collection period", () => {
    const record = parseCruxRecord(recordFixture)!;
    expect(record.metrics.lcp).toEqual({
      p75: 2310,
      good: 0.7123,
      needsImprovement: 0.2,
      poor: 0.0877,
    });
    expect(record.metrics.cls?.p75).toBe(0.05);
    expect(record.metrics.inp?.p75).toBe(180);
    expect(record.metrics.fcp).toBeUndefined();
    expect(record.periodStart).toBe("2026-10-12");
    expect(record.periodEnd).toBe("2026-11-08");
  });

  it("returns null when no metric has data", () => {
    expect(parseCruxRecord({})).toBeNull();
    expect(parseCruxRecord({ record: { metrics: {} } })).toBeNull();
  });
});

describe("parseCruxHistory", () => {
  it("turns weekly series into numbers and gaps", () => {
    const trend = parseCruxHistory(historyFixture)!;
    expect(trend.dates).toEqual(["2026-10-18", "2026-10-25", "2026-11-01"]);
    expect(trend.metrics.lcp?.p75s).toEqual([2400, null, 2201]);
    expect(trend.metrics.cls?.p75s).toEqual([0.04, null, 0.051]);
    expect(trend.metrics.inp).toBeUndefined();
  });

  it("returns null without collection periods", () => {
    expect(parseCruxHistory({ record: { metrics: {} } })).toBeNull();
  });
});

describe("queryCruxRecord", () => {
  it("posts the target with the key in a header, not the URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(recordFixture));
    const record = await queryCruxRecord({
      target: { origin: "https://example.com" },
      formFactor: "PHONE",
      apiKey: " secret-key ",
      fetchImpl,
    });
    expect(record?.metrics.lcp?.p75).toBe(2310);
    const { url, headers, body } = sentRequest(fetchImpl);
    expect(url).toBe(CRUX_RECORD_ENDPOINT);
    expect(url).not.toContain("secret-key");
    expect(headers.get("X-goog-api-key")).toBe("secret-key");
    expect(body.origin).toBe("https://example.com");
    expect(body.formFactor).toBe("PHONE");
    expect(body.metrics).toContain("interaction_to_next_paint");
  });

  it("omits formFactor for all devices", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(recordFixture));
    await queryCruxRecord({
      target: { url: "https://example.com/" },
      apiKey: "k",
      fetchImpl,
    });
    const { body } = sentRequest(fetchImpl);
    expect(body.url).toBe("https://example.com/");
    expect(body).not.toHaveProperty("formFactor");
  });

  it("treats 404 as 'no data', not an error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: 404, status: "NOT_FOUND", message: "not found" } },
        404,
      ),
    );
    await expect(
      queryCruxRecord({
        target: { origin: "https://tiny.example" },
        apiKey: "k",
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });

  it("flags a refused key as a permission error and redacts it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            message: "Key secret-key blocked",
          },
        },
        403,
      ),
    );
    const error = await rejection(
      queryCruxRecord({
        target: { origin: "https://example.com" },
        apiKey: "secret-key",
        fetchImpl,
      }),
    );
    expect(error).toBeInstanceOf(CruxError);
    if (!(error instanceof CruxError)) throw error;
    expect(error.permission).toBe(true);
    expect(error.message).not.toContain("secret-key");
  });

  it("marks 429 and 5xx as retryable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const error = await rejection(
      queryCruxRecord({
        target: { origin: "https://example.com" },
        apiKey: "k",
        fetchImpl,
      }),
    );
    if (!(error instanceof CruxError)) throw error;
    expect(error.retryable).toBe(true);
    expect(error.permission).toBe(false);
  });

  it("refuses to call without a key", async () => {
    const fetchImpl = vi.fn();
    await expect(
      queryCruxRecord({
        target: { origin: "https://example.com" },
        apiKey: "  ",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(CruxError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("queryCruxHistory", () => {
  it("asks the History API for weekly periods", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(historyFixture));
    const trend = await queryCruxHistory({
      target: { origin: "https://example.com" },
      apiKey: "k",
      periods: 12,
      fetchImpl,
    });
    expect(trend?.dates).toHaveLength(3);
    const { url, body } = sentRequest(fetchImpl);
    expect(url).toBe(CRUX_HISTORY_ENDPOINT);
    expect(body.collectionPeriodCount).toBe(12);
  });

  it("returns null on 404", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    await expect(
      queryCruxHistory({
        target: { origin: "https://tiny.example" },
        apiKey: "k",
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });
});
