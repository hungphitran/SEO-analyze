import { UnsecuredJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));

import { serveEveryAppRequest } from "./gateway-attribution";
import {
  assertPaidProviderAllowed,
  getBlockedProviderCallsStats,
  getContextFetch,
  getDataforseoFetch,
  hasProviderAccess,
  resetBlockedProviderCallsStats,
} from "./provider-access";

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const fetchMock = vi.fn<typeof fetch>();

function lastAuthorization() {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  return new Headers(init?.headers).get("authorization");
}

describe("provider access with the deployment's own keys", () => {
  it("puts the deployment's keys on DataForSEO and Context.dev calls", async () => {
    vi.stubEnv("DATAFORSEO_API_KEY", "encoded-credentials");
    vi.stubEnv("CONTEXT_API_KEY", "context-key");
    Object.assign(workerEnv, {
      AUTH_MODE: "cloudflare_access",
      DATAFORSEO_API_KEY: "encoded-credentials",
      CONTEXT_API_KEY: "context-key",
    });
    fetchMock.mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await (
      await getDataforseoFetch()
    )("https://api.dataforseo.com/v3/x");
    expect(lastAuthorization()).toBe("Basic encoded-credentials");

    const contextFetch = await getContextFetch();
    await contextFetch?.("https://api.context.dev/v1/web/scrape/html");
    expect(lastAuthorization()).toBe("Bearer context-key");

    expect(await hasProviderAccess("dataforseo")).toBe(true);
    expect(await hasProviderAccess("context")).toBe(true);
  });

  it("has no Context.dev fetch without its key", async () => {
    workerEnv.AUTH_MODE = "local_noauth";
    expect(await getContextFetch()).toBeNull();
    expect(await hasProviderAccess("context")).toBe(false);
  });
});

describe("provider access behind an Every App gateway", () => {
  it("never uses a key on the deployment, and refuses without the gateway binding", async () => {
    Object.assign(workerEnv, {
      AUTH_MODE: "everyapp",
      EVERYAPP_APP_ID: "openseo",
      // Set by mistake: the gateway mode must not read it.
      DATAFORSEO_API_KEY: "encoded-credentials",
    });

    await expect(getDataforseoFetch()).rejects.toMatchObject({
      code: "DATAFORSEO_AUTH_FAILED",
    });
  });
});

describe("whose calls they are, behind the gateway", () => {
  const sent: Request[] = [];
  const binding = {
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Request(input, init));
      return Response.json({ requested: true, configured: true, ready: true });
    }),
  };

  function gateway() {
    sent.length = 0;
    Object.assign(workerEnv, {
      AUTH_MODE: "everyapp",
      EVERYAPP_APP_ID: "openseo",
      EVERY_APP_GATEWAY: binding,
    });
  }

  it("forwards the identity of the request it serves", async () => {
    gateway();
    const token = new UnsecuredJWT({ org_id: "org_a" })
      .setExpirationTime("2m")
      .encode();
    const request = new Request("https://openseo.app.everyapp.com/", {
      headers: { "x-everyapp-identity": token },
    });
    const user = {
      id: "user_ana",
      email: "ana@example.com",
      orgId: "org_a",
      orgRole: "member" as const,
      channel: "web" as const,
      actor: { sub: "user_ana" },
      scopes: ["*"],
      jti: "jti_1",
    };

    const dataforseo = await serveEveryAppRequest(request, user, () =>
      getDataforseoFetch(),
    );
    await dataforseo("https://api.dataforseo.com/v3/serp/google/locations/us");

    const [call] = sent;
    expect(call.headers.get("x-everyapp-identity")).toBe(token);
  });

  it("makes work no request started the install's background work", async () => {
    gateway();
    const contextFetch = await getContextFetch();
    await contextFetch?.("https://api.context.dev/v1/web/scrape/html");

    const [call] = sent;
    expect(call.headers.get("x-everyapp-identity")).toBeNull();
    expect(call.headers.get("x-everyapp-org")).toBeNull();
  });
});

describe("free-sources mode", () => {
  it("refuses DataForSEO, Context.dev, and OpenRouter before any network call when FREE_SOURCES_ONLY is on", async () => {
    resetBlockedProviderCallsStats();
    vi.stubEnv("FREE_SOURCES_ONLY", "true");
    Object.assign(workerEnv, {
      AUTH_MODE: "password",
      DATAFORSEO_API_KEY: "super-secret-df-key",
      CONTEXT_API_KEY: "super-secret-ctx-key",
      FREE_SOURCES_ONLY: "true",
    });
    const blockedFetch = vi.fn();
    vi.stubGlobal("fetch", blockedFetch);

    await expect(getDataforseoFetch()).rejects.toMatchObject({
      code: "FREE_SOURCES_ONLY",
      details: { provider: "dataforseo", diagnosticCode: "PAID_SOURCE_DISABLED" },
    });
    expect(await getContextFetch()).toBeNull();
    expect(await hasProviderAccess("dataforseo")).toBe(false);
    expect(await hasProviderAccess("context")).toBe(false);

    let caught: unknown;
    try {
      await assertPaidProviderAllowed("openrouter");
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "PAID_SOURCE_DISABLED" });
    expect(JSON.stringify(caught)).not.toContain("super-secret");
    expect(blockedFetch).not.toHaveBeenCalled();

    const stats = getBlockedProviderCallsStats();
    expect(stats.blocked_provider_calls_total).toBe(3);
    expect(stats.byProvider).toEqual({
      dataforseo: 1,
      context: 1,
      openrouter: 1,
    });
  });
});
