import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
  env: {},
}));
vi.mock(
  "@/server/features/free-sources/repositories/BingWebmasterConnectionRepository",
  () => ({
    BingWebmasterConnectionRepository: {
      upsert: mocks.upsert,
      getByProjectId: vi.fn(),
      deleteByProjectId: vi.fn(),
    },
  }),
);
vi.mock(
  "@/server/features/free-sources/repositories/OwnedSiteSnapshotRepository",
  () => ({
    OwnedSiteSnapshotRepository: {},
  }),
);
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {},
}));
vi.mock("@/server/lib/free-sources/secret-box", () => ({
  sealSecret: async (value: string) => `sealed:${value.length}`,
  openSecret: async (value: string) => value,
  hasFreeSourcesEncryptionKey: async () => true,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => undefined,
}));

import { saveBingConnection } from "./FreeSourcesService";

const KEY = "0123456789abcdef0123456789abcdef";
const base = {
  projectId: "p1",
  organizationId: "o1",
  userId: "u1",
  apiKey: KEY,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ipThrottle = () =>
  json({ ErrorCode: 17, Message: "ERROR!!! ThrottleIP" }, 400);

describe("saveBingConnection manual site path", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("verifies a typed site with one cheap call and saves the normalized origin", async () => {
    mocks.fetch.mockResolvedValue(json({ d: { DailyQuota: 5 } }));
    const result = await saveBingConnection({
      ...base,
      siteUrl: "Example.com/blog",
      manual: true,
    });
    expect(result).toEqual({ siteUrl: "https://example.com/", verified: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain(
      "GetUrlSubmissionQuota",
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://example.com/" }),
    );
  });

  it("rejects an invalid site address without calling Bing or saving", async () => {
    await expect(
      saveBingConnection({ ...base, siteUrl: "not a site", manual: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not save when Bing is limiting the IP unless the user chose to skip the check", async () => {
    mocks.fetch.mockImplementation(async () => ipThrottle());
    await expect(
      saveBingConnection({ ...base, siteUrl: "example.com", manual: true }),
    ).rejects.toMatchObject({ code: "BING_IP_THROTTLED" });
    expect(mocks.upsert).not.toHaveBeenCalled();

    const result = await saveBingConnection({
      ...base,
      siteUrl: "example.com",
      manual: true,
      skipVerification: true,
    });
    expect(result).toEqual({
      siteUrl: "https://example.com/",
      verified: false,
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("skipVerification never bypasses a rejected key or a site the key does not own", async () => {
    mocks.fetch.mockImplementation(async () =>
      json({ ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" }, 400),
    );
    await expect(
      saveBingConnection({
        ...base,
        siteUrl: "example.com",
        manual: true,
        skipVerification: true,
      }),
    ).rejects.toMatchObject({ code: "BING_KEY_REJECTED" });

    mocks.fetch.mockImplementation(async () =>
      json({ ErrorCode: 14, Message: "ERROR!!! NotAuthorized" }, 400),
    );
    await expect(
      saveBingConnection({
        ...base,
        siteUrl: "example.com",
        manual: true,
        skipVerification: true,
      }),
    ).rejects.toMatchObject({ code: "BING_SITE_NOT_VERIFIED" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("keeps the list-based path verifying against the key's verified sites", async () => {
    mocks.fetch.mockResolvedValue(
      json({ d: [{ Url: "https://Example.com/", IsVerified: true }] }),
    );
    const result = await saveBingConnection({
      ...base,
      siteUrl: "https://example.com/",
    });
    expect(result).toEqual({ siteUrl: "https://Example.com/", verified: true });
    mocks.fetch.mockResolvedValue(json({ d: [] }));
    await expect(
      saveBingConnection({ ...base, siteUrl: "https://example.com/" }),
    ).rejects.toMatchObject({ code: "BING_SITE_NOT_VERIFIED" });
  });
});
