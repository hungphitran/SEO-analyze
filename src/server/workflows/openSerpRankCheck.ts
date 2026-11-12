import type { WorkflowStep } from "cloudflare:workers";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  assertOpenSerpReady,
  getOpenSerpDailyRequestLimit,
  OpenSerpError,
  searchOpenSerp,
} from "@/server/lib/openserp";
import { pgStep } from "@/server/workflows/pgStep";

const OPEN_SERP_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "1 minute" as const,
};

export async function runOpenSerpRankCheck(
  step: WorkflowStep,
  input: {
    runId: string;
    projectId: string;
    configId: string;
    domain: string;
    locationCode: number;
    languageCode: string;
    locationName?: string;
    serpDepth: number;
    keywords: Array<{ id: string; keyword: string }>;
  },
) {
  let keywordsChecked = 0;
  for (const [index, keyword] of input.keywords.entries()) {
    const outcome = await pgStep(
      step,
      `openserp-keyword-${index}`,
      OPEN_SERP_STEP_CONFIG,
      async () => {
        let snapshot;
        try {
          await assertOpenSerpReady({ locationName: input.locationName });
          const reserved = await RankTrackingRepository.reserveOpenSerpRequest(
            input.projectId,
            await getOpenSerpDailyRequestLimit(),
          );
          if (!reserved) {
            throw new OpenSerpError(
              "quota_exceeded",
              "OpenSERP daily project request limit reached; no rank was recorded.",
            );
          }
          snapshot = await searchOpenSerp({
            keyword: keyword.keyword,
            region: getIsoCountryCode(input.locationCode),
            lang: input.languageCode,
            limit: input.serpDepth,
            locationName: input.locationName,
          });
        } catch (error) {
          return {
            ok: false as const,
            code:
              error instanceof OpenSerpError ? error.code : "upstream_error",
            requestId:
              error instanceof OpenSerpError
                ? error.details?.requestId
                : undefined,
            message:
              error instanceof OpenSerpError
                ? error.message
                : "OpenSERP rank check failed; no rank was recorded.",
          };
        }

        const targetDomain = normalizeTargetDomain(input.domain);
        const match = snapshot.results.find(
          (result) =>
            result.hostname === targetDomain ||
            result.hostname.endsWith(`.${targetDomain}`),
        );
        await RankTrackingRepository.insertOpenSerpSnapshot({
          id: `${input.runId}:${keyword.id}`,
          runId: input.runId,
          projectId: input.projectId,
          configId: input.configId,
          trackingKeywordId: keyword.id,
          snapshot,
        });
        await RankTrackingRepository.insertSnapshots([
          {
            runId: input.runId,
            trackingKeywordId: keyword.id,
            keyword: keyword.keyword,
            device: "desktop",
            position: match?.organicRank ?? null,
            absolutePosition: match?.absolutePosition ?? null,
            url: match?.url ?? null,
            serpFeatures:
              snapshot.serpFeatures.length > 0
                ? JSON.stringify(snapshot.serpFeatures)
                : null,
          },
        ]);
        const nextChecked = keywordsChecked + 1;
        await RankTrackingRepository.updateRun(input.runId, {
          keywordsChecked: nextChecked,
        });
        return { ok: true as const, keywordsChecked: nextChecked };
      },
    );
    if (outcome.ok) {
      keywordsChecked = outcome.keywordsChecked;
      continue;
    }

    console.warn(
      `[rank-check] ${input.runId} OpenSERP request failed (${outcome.code})`,
    );
    await pgStep(
      step,
      `openserp-failure-${index}`,
      OPEN_SERP_STEP_CONFIG,
      async () => {
        await RankTrackingRepository.insertOpenSerpFailure({
          id: `${input.runId}:${keyword.id}`,
          runId: input.runId,
          projectId: input.projectId,
          configId: input.configId,
          trackingKeywordId: keyword.id,
          keyword: keyword.keyword,
          region: getIsoCountryCode(input.locationCode),
          lang: input.languageCode,
          limitRequested: input.serpDepth,
          errorCode: outcome.code,
          requestId: outcome.requestId,
        });
        await RankTrackingRepository.setRunErrorIfEmpty(
          input.runId,
          outcome.message,
        );
        await RankTrackingRepository.updateRun(input.runId, {
          keywordsChecked,
        });
        return true;
      },
    );
    if (outcome.code === "quota_exceeded") break;
  }
}

function normalizeTargetDomain(domain: string) {
  return domain
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}
