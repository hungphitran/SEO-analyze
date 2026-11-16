import { sort } from "remeda";
import {
  KeywordOpportunityRepository,
  type KeywordOpportunityInsert,
  type OpportunityRule,
} from "@/server/features/free-sources/repositories/KeywordOpportunityRepository";
import { SeoFactsRepository } from "@/server/features/free-sources/repositories/SeoFactsRepository";
import { clusterQueriesByRules } from "./KeywordClusteringService";

export const OPPORTUNITY_SCORE_VERSION = "v1.0";

export type QueryObservation = {
  query: string;
  targetUrl: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
  previousClicks?: number | null;
  previousImpressions?: number | null;
};

export type DetectedOpportunity = {
  dedupeKey: string;
  query: string;
  targetUrl: string | null;
  rule: OpportunityRule;
  score: number | null;
  scoreVersion: string;
  partialScore: boolean;
  confidence: "high" | "medium" | "low";
  whySuggested: string;
  evidence: {
    clicks: number;
    impressions: number;
    ctr: number;
    averagePosition: number;
    baselineCtr: number | null;
    previousImpressions: number | null;
    competingUrls: string[];
    components: {
      impactImpressions: number | null;
      positionPotential: number | null;
      ctrGap: number | null;
      trend: number | null;
    };
  };
};

function percentileRank(value: number, all: number[]): number {
  if (all.length <= 1) return 1;
  const lower = all.filter((v) => v < value).length;
  return lower / (all.length - 1);
}

function positionBucket(pos: number): string {
  if (pos <= 3) return "1-3";
  if (pos <= 10) return "4-10";
  if (pos <= 20) return "11-20";
  return "21+";
}

function computeTransparentScore(input: {
  impressions: number;
  allImpressions: number[];
  averagePosition: number;
  ctr: number;
  baselineCtr: number | null;
  previousImpressions: number | null;
}): {
  score: number | null;
  partialScore: boolean;
  components: DetectedOpportunity["evidence"]["components"];
} {
  const impactImpressions = percentileRank(
    input.impressions,
    input.allImpressions,
  );
  const positionPotential =
    input.averagePosition >= 4 && input.averagePosition <= 20
      ? 1 - (input.averagePosition - 4) / 16
      : input.averagePosition < 4
        ? 0.4
        : 0.15;

  const ctrGap =
    input.baselineCtr !== null && input.baselineCtr > 0
      ? Math.max(0, Math.min(1, (input.baselineCtr - input.ctr) / input.baselineCtr))
      : null;

  const trend =
    input.previousImpressions !== null && input.previousImpressions > 0
      ? Math.max(
          0,
          Math.min(
            1,
            0.5 +
              (input.impressions - input.previousImpressions) /
                (2 * input.previousImpressions),
          ),
        )
      : null;

  const weights: Array<{ value: number | null; weight: number }> = [
    { value: impactImpressions, weight: 0.35 },
    { value: positionPotential, weight: 0.25 },
    { value: ctrGap, weight: 0.25 },
    { value: trend, weight: 0.15 },
  ];

  let activeWeight = 0;
  let weightedSum = 0;
  let partialScore = false;
  for (const w of weights) {
    if (w.value === null) {
      partialScore = true;
    } else {
      activeWeight += w.weight;
      weightedSum += w.value * w.weight;
    }
  }

  const score =
    activeWeight > 0 ? Math.round((weightedSum / activeWeight) * 1000) / 10 : null;

  return {
    score,
    partialScore,
    components: {
      impactImpressions: Math.round(impactImpressions * 1000) / 1000,
      positionPotential: Math.round(positionPotential * 1000) / 1000,
      ctrGap: ctrGap !== null ? Math.round(ctrGap * 1000) / 1000 : null,
      trend: trend !== null ? Math.round(trend * 1000) / 1000 : null,
    },
  };
}

/**
 * Pure, deterministic owned-site opportunity detector (T30).
 * Never invents global search volume, KD, or CPC.
 */
export function detectKeywordOpportunities(
  observations: QueryObservation[],
  opts: { nearTopMin?: number; nearTopMax?: number; minImpressions?: number } = {},
): DetectedOpportunity[] {
  const nearTopMin = opts.nearTopMin ?? 4;
  const nearTopMax = opts.nearTopMax ?? 20;
  const minImpressions = opts.minImpressions ?? 20;

  const filtered = observations.filter((o) => o.impressions >= minImpressions);
  if (filtered.length === 0) return [];

  // Build site-internal CTR baseline per position bucket (requires >= 3 queries).
  const bucketCtrs = new Map<string, number[]>();
  const urlsByQuery = new Map<string, Set<string>>();
  for (const obs of filtered) {
    const b = positionBucket(obs.averagePosition);
    const list = bucketCtrs.get(b) ?? [];
    list.push(obs.ctr);
    bucketCtrs.set(b, list);

    if (obs.targetUrl) {
      const set = urlsByQuery.get(obs.query) ?? new Set<string>();
      set.add(obs.targetUrl);
      urlsByQuery.set(obs.query, set);
    }
  }

  const baselineByBucket = new Map<string, number | null>();
  for (const [b, ctrs] of bucketCtrs.entries()) {
    if (ctrs.length < 3) {
      baselineByBucket.set(b, null);
    } else {
      const avg = ctrs.reduce((sum, v) => sum + v, 0) / ctrs.length;
      baselineByBucket.set(b, avg);
    }
  }

  const allImpressions = filtered.map((o) => o.impressions);
  const results: DetectedOpportunity[] = [];

  for (const obs of filtered) {
    const bucket = positionBucket(obs.averagePosition);
    const baselineCtr = baselineByBucket.get(bucket) ?? null;
    const competingUrls = Array.from(urlsByQuery.get(obs.query) ?? []);

    const rules: Array<{ rule: OpportunityRule; why: string; conf: "high" | "medium" | "low" }> = [];

    if (baselineCtr !== null && obs.ctr < baselineCtr * 0.75) {
      rules.push({
        rule: "ctr_opportunity",
        why: `CTR (${(obs.ctr * 100).toFixed(2)}%) thấp hơn mức nền của chính website (${(baselineCtr * 100).toFixed(2)}%) ở nhóm vị trí ${bucket}.`,
        conf: obs.impressions >= 100 ? "high" : "medium",
      });
    }

    if (
      obs.averagePosition >= nearTopMin &&
      obs.averagePosition <= nearTopMax
    ) {
      rules.push({
        rule: "near_top",
        why: `Vị trí trung bình GSC ${obs.averagePosition.toFixed(1)} (lưu ý: avg position GSC không phải thứ hạng SERP live).`,
        conf: obs.averagePosition <= 10 ? "high" : "medium",
      });
    }

    if (
      obs.previousImpressions !== undefined &&
      obs.previousImpressions !== null &&
      obs.previousImpressions >= minImpressions
    ) {
      if (obs.impressions < obs.previousImpressions * 0.7) {
        rules.push({
          rule: "decaying",
          why: `Impressions giảm từ ${obs.previousImpressions} xuống ${obs.impressions} so với kỳ trước.`,
          conf: "medium",
        });
      } else if (obs.impressions > obs.previousImpressions * 1.35) {
        rules.push({
          rule: "growing",
          why: `Impressions tăng từ ${obs.previousImpressions} lên ${obs.impressions} so với kỳ trước.`,
          conf: "medium",
        });
      }
    }

    if (competingUrls.length >= 2) {
      rules.push({
        rule: "cannibalization",
        why: `Ứng viên cannibalization tiềm năng: ${competingUrls.length} URL cùng nhận impressions cho query này (cần kiểm tra thủ công).`,
        conf: "low",
      });
    }

    for (const r of rules) {
      const scored = computeTransparentScore({
        impressions: obs.impressions,
        allImpressions,
        averagePosition: obs.averagePosition,
        ctr: obs.ctr,
        baselineCtr,
        previousImpressions: obs.previousImpressions ?? null,
      });

      results.push({
        dedupeKey: `${r.rule}|${obs.query}|${obs.targetUrl ?? ""}|${OPPORTUNITY_SCORE_VERSION}`,
        query: obs.query,
        targetUrl: obs.targetUrl,
        rule: r.rule,
        score: scored.score,
        scoreVersion: OPPORTUNITY_SCORE_VERSION,
        partialScore: scored.partialScore,
        confidence: r.conf,
        whySuggested: r.why,
        evidence: {
          clicks: obs.clicks,
          impressions: obs.impressions,
          ctr: obs.ctr,
          averagePosition: obs.averagePosition,
          baselineCtr,
          previousImpressions: obs.previousImpressions ?? null,
          competingUrls,
          components: scored.components,
        },
      });
    }
  }

  return sort(results, (a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export async function refreshKeywordOpportunitiesFromFacts(input: {
  projectId: string;
  organizationId: string;
  periodLabel?: string;
}) {
  const facts = await SeoFactsRepository.listDailyFacts({
    projectId: input.projectId,
    source: "gsc",
    limit: 5000,
  });

  const byQueryUrl = new Map<
    string,
    {
      query: string;
      targetUrl: string | null;
      clicks: number;
      impressions: number;
      posWeighted: number;
    }
  >();

  for (const row of facts) {
    if (!row.query) continue;
    const key = `${row.query}|${row.pageUrl ?? ""}`;
    const existing = byQueryUrl.get(key) ?? {
      query: row.query,
      targetUrl: row.pageUrl ?? null,
      clicks: 0,
      impressions: 0,
      posWeighted: 0,
    };
    const clicks = row.clicks ?? 0;
    const impressions = row.impressions ?? 0;
    existing.clicks += clicks;
    existing.impressions += impressions;
    if (row.averagePosition !== null && impressions > 0) {
      existing.posWeighted += row.averagePosition * impressions;
    }
    byQueryUrl.set(key, existing);
  }

  const observations: QueryObservation[] = Array.from(byQueryUrl.values())
    .filter((item) => item.impressions > 0)
    .map((item) => ({
      query: item.query,
      targetUrl: item.targetUrl,
      clicks: item.clicks,
      impressions: item.impressions,
      ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
      averagePosition:
        item.impressions > 0 ? item.posWeighted / item.impressions : 0,
    }));

  const detected = detectKeywordOpportunities(observations);
  const inserts: KeywordOpportunityInsert[] = detected
    .slice(0, 200)
    .map((d) => ({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      organizationId: input.organizationId,
      dedupeKey: d.dedupeKey,
      query: d.query,
      targetUrl: d.targetUrl,
      rule: d.rule,
      score: d.score,
      scoreVersion: d.scoreVersion,
      partialScore: d.partialScore,
      confidence: d.confidence,
      evidencePeriod: input.periodLabel ?? "last_28_days",
      evidenceJson: JSON.stringify(d.evidence),
      whySuggested: d.whySuggested,
    }));

  await KeywordOpportunityRepository.upsertMany(inserts);

  const clusters = clusterQueriesByRules(
    observations.map((o) => ({ query: o.query, source: "gsc" })),
  ).slice(0, 100);
  await KeywordOpportunityRepository.replaceClusters({
    projectId: input.projectId,
    organizationId: input.organizationId,
    clusters,
  });

  return {
    opportunitiesCount: inserts.length,
    clustersCount: clusters.length,
  };
}
