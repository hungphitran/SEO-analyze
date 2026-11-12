import type { WorkflowStep } from "cloudflare:workers";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { OpenSerpError } from "@/server/lib/openserp";
import {
  freeSerpProviderLabel,
  hostnameMatchesTarget,
  normalizeRankTargetDomain,
  searchFreeSerp,
  type FreeSerpProvider,
} from "@/server/lib/free-serp";
import { pgStep } from "@/server/workflows/pgStep";

const OPEN_SERP_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "1 minute" as const,
};

export async function runOpenSerpRankCheck(
  step: WorkflowStep,
  input: {
    runId: string;
    sourceProvider?: FreeSerpProvider;
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
  const provider = input.sourceProvider ?? "openserp";
  const label = freeSerpProviderLabel(provider);
  let keywordsChecked = 0;
  for (const [index, keyword] of input.keywords.entries()) {
    const outcome = await pgStep(
      step,
      `openserp-keyword-${index}`,
      OPEN_SERP_STEP_CONFIG,
      async () => {
        let snapshot;
        const targetDomain = normalizeRankTargetDomain(input.domain);
        if (!targetDomain) {
          // Refuse before spending quota: an unusable domain can only produce
          // a wrong "not ranked".
          return {
            ok: false as const,
            code: "invalid_input" as const,
            requestId: undefined,
            message: `Tracked domain is invalid; no rank was recorded.`,
          };
        }
        try {
          snapshot = await searchFreeSerp(provider, {
            projectId: input.projectId,
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
                : `${label} rank check failed; no rank was recorded.`,
          };
        }

        // Position stays null ("not ranked in the fetched results") when the
        // domain is absent; it is never 0 or a guess.
        const match = snapshot.results.find((result) =>
          hostnameMatchesTarget(result.hostname, targetDomain),
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
      `[rank-check] ${input.runId} ${label} request failed (${outcome.code})`,
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
    // Out of quota (or SerpApi throughput): stop instead of burning every
    // remaining keyword on a request that will be refused.
    if (
      outcome.code === "quota_exceeded" ||
      (provider === "serpapi" && outcome.code === "rate_limited")
    ) {
      break;
    }
  }
}
