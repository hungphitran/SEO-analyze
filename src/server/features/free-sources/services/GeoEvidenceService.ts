import { and, desc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "@/db";
import { geoDailyFacts, geoImportBatches } from "@/db/schema";

const MAX_GEO_CSV_BYTES = 5 * 1024 * 1024;
const MAX_GEO_CSV_ROWS = 50_000;
const GEO_SCHEMA_MAPPING_VERSION = "v1.0";

type GeoImportSource = "bing_ai_csv" | "google_genai_csv";
type GeoMetricType = "bing_ai_citations" | "google_genai_impressions";

type GeoColumnMapping = {
  dateColumn: string;
  metricColumn: string;
  pageColumn?: string;
  queryColumn?: string;
  countryColumn?: string;
  deviceColumn?: string;
};

type ParsedGeoRow = {
  factDate: string;
  metricValue: number;
  pageUrl: string | null;
  queryOrTopic: string | null;
  country: string | null;
  device: string | null;
  rowFingerprint: string;
  outOfScopeWarning: boolean;
};

type GeoPreviewResult = {
  source: GeoImportSource;
  metricType: GeoMetricType;
  headers: string[];
  totalRows: number;
  validRows: ParsedGeoRow[];
  invalidRowCount: number;
  outOfScopeCount: number;
  errors: Array<{ rowIndex: number; reason: string }>;
};

export function escapeCsvFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeDateIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeDomainHost(domainOrUrl: string): string | null {
  try {
    const parsed = new URL(
      domainOrUrl.includes("://") ? domainOrUrl : `https://${domainOrUrl}`,
    );
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isUrlInProjectScope(
  pageUrl: string | null,
  projectHost: string | null,
): boolean {
  if (!pageUrl || !projectHost) return true;
  if (pageUrl.startsWith("/")) return true;
  const urlHost = normalizeDomainHost(pageUrl);
  if (!urlHost) return false;
  return urlHost === projectHost || urlHost.endsWith(`.${projectHost}`);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function resolveCsvColumns(
  headers: string[],
  source: GeoImportSource,
  mapping?: GeoColumnMapping,
) {
  const findHeader = (candidates: string[]) =>
    headers.find((h) =>
      candidates.some((c) => h.toLowerCase() === c.toLowerCase()),
    );

  const dateCol =
    mapping?.dateColumn ?? findHeader(["date", "day", "ngay", "fact_date"]);
  const metricCol =
    mapping?.metricColumn ??
    findHeader(
      source === "bing_ai_csv"
        ? ["citations", "citation_count", "total_citations", "trich_dan"]
        : ["impressions", "genai_impressions", "ai_impressions"],
    );
  return {
    dateCol,
    metricCol,
    pageCol:
      mapping?.pageColumn ??
      findHeader(["cited_url", "page", "url", "landing_page"]),
    queryCol:
      mapping?.queryColumn ??
      findHeader(["grounding_query", "query", "topic", "top_queries"]),
    countryCol: mapping?.countryColumn ?? findHeader(["country", "quoc_gia"]),
    deviceCol: mapping?.deviceColumn ?? findHeader(["device", "thiet_bi"]),
  };
}

export async function previewGeoCsvImport(input: {
  source: GeoImportSource;
  csvText: string;
  projectDomain: string;
  mapping?: GeoColumnMapping;
}): Promise<GeoPreviewResult> {
  const byteLength = new TextEncoder().encode(input.csvText).byteLength;
  if (byteLength > MAX_GEO_CSV_BYTES) {
    throw new Error("Tệp CSV vượt quá giới hạn 5 MB.");
  }

  const cleaned = stripUtf8Bom(input.csvText);
  const parsed = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    throw new Error("Tệp CSV không có dòng tiêu đề hợp lệ.");
  }
  if (parsed.data.length > MAX_GEO_CSV_ROWS) {
    throw new Error(`Tệp CSV vượt quá giới hạn ${MAX_GEO_CSV_ROWS} dòng.`);
  }

  const cols = resolveCsvColumns(headers, input.source, input.mapping);
  if (!cols.dateCol || !cols.metricCol) {
    throw new Error(
      "Không tìm thấy cột ngày (date) hoặc cột chỉ số (citations / impressions). Vui lòng chọn ánh xạ cột.",
    );
  }
  const { dateCol, metricCol, pageCol, queryCol, countryCol, deviceCol } = cols;

  const projectHost = normalizeDomainHost(input.projectDomain);
  const metricType: GeoMetricType =
    input.source === "bing_ai_csv"
      ? "bing_ai_citations"
      : "google_genai_impressions";

  const validRows: ParsedGeoRow[] = [];
  const errors: Array<{ rowIndex: number; reason: string }> = [];
  let outOfScopeCount = 0;

  for (let i = 0; i < parsed.data.length; i += 1) {
    const row = parsed.data[i];
    const rawDate = row[dateCol] ?? "";
    const factDate = normalizeDateIso(rawDate);
    if (!factDate) {
      errors.push({ rowIndex: i + 1, reason: `Ngày không hợp lệ: ${rawDate}` });
      continue;
    }

    const rawMetric = (row[metricCol] ?? "").replace(/,/g, "").trim();
    const metricValue = Number(rawMetric);
    if (!Number.isInteger(metricValue) || metricValue < 0) {
      errors.push({
        rowIndex: i + 1,
        reason: `Giá trị chỉ số phải là số nguyên không âm: ${rawMetric}`,
      });
      continue;
    }

    const pageUrl =
      pageCol && row[pageCol]?.trim() ? row[pageCol].trim() : null;
    const queryOrTopic =
      queryCol && row[queryCol]?.trim() ? row[queryCol].trim() : null;
    const country =
      countryCol && row[countryCol]?.trim() ? row[countryCol].trim() : null;
    const device =
      deviceCol && row[deviceCol]?.trim() ? row[deviceCol].trim() : null;

    const inScope = isUrlInProjectScope(pageUrl, projectHost);
    if (!inScope) outOfScopeCount += 1;

    const rowFingerprint = await sha256Hex(
      [
        input.source,
        metricType,
        factDate,
        pageUrl ?? "",
        queryOrTopic ?? "",
        country ?? "",
        device ?? "",
        String(metricValue),
      ].join("|"),
    );

    validRows.push({
      factDate,
      metricValue,
      pageUrl,
      queryOrTopic,
      country,
      device,
      rowFingerprint,
      outOfScopeWarning: !inScope,
    });
  }

  return {
    source: input.source,
    metricType,
    headers,
    totalRows: parsed.data.length,
    validRows,
    invalidRowCount: errors.length,
    outOfScopeCount,
    errors: errors.slice(0, 50),
  };
}

export async function commitGeoCsvImport(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  source: GeoImportSource;
  reportType: string;
  filename: string;
  csvText: string;
  projectDomain: string;
  allowOutOfScope?: boolean;
  mapping?: GeoColumnMapping;
}) {
  const preview = await previewGeoCsvImport({
    source: input.source,
    csvText: input.csvText,
    projectDomain: input.projectDomain,
    mapping: input.mapping,
  });

  if (preview.outOfScopeCount > 0 && !input.allowOutOfScope) {
    throw new Error(
      `Phát hiện ${preview.outOfScopeCount} URL ngoài phạm vi domain dự án (${input.projectDomain}). Xác nhận lý do trước khi nhập.`,
    );
  }

  const batchId = crypto.randomUUID();
  const filenameHash = await sha256Hex(input.csvText);
  const validationStatus =
    preview.invalidRowCount === 0
      ? "valid"
      : preview.validRows.length > 0
        ? "partial"
        : "failed";

  await db.insert(geoImportBatches).values({
    id: batchId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    source: input.source,
    reportType: input.reportType,
    filename: input.filename,
    filenameHash,
    schemaMappingVersion: GEO_SCHEMA_MAPPING_VERSION,
    recordCount: preview.validRows.length,
    validationStatus,
    completeness: "sampled",
    importedByUserId: input.userId,
    importedAt: new Date().toISOString(),
  });

  let insertedCount = 0;
  for (const row of preview.validRows) {
    const res = await db
      .insert(geoDailyFacts)
      .values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        organizationId: input.organizationId,
        batchId,
        source: input.source,
        factDate: row.factDate,
        metricType: preview.metricType,
        pageUrl: row.pageUrl,
        queryOrTopic: row.queryOrTopic,
        country: row.country,
        device: row.device,
        metricValue: row.metricValue,
        rowFingerprint: row.rowFingerprint,
        completeness: "sampled",
      })
      .onConflictDoNothing({
        target: [
          geoDailyFacts.projectId,
          geoDailyFacts.source,
          geoDailyFacts.rowFingerprint,
        ],
      })
      .returning({ id: geoDailyFacts.id });
    if (res.length > 0) insertedCount += 1;
  }

  return {
    batchId,
    totalParsed: preview.validRows.length,
    insertedCount,
    deduplicatedCount: preview.validRows.length - insertedCount,
    invalidRowCount: preview.invalidRowCount,
  };
}

export async function rollbackGeoImportBatch(input: {
  projectId: string;
  batchId: string;
}) {
  const deletedFacts = await db
    .delete(geoDailyFacts)
    .where(
      and(
        eq(geoDailyFacts.projectId, input.projectId),
        eq(geoDailyFacts.batchId, input.batchId),
      ),
    )
    .returning({ id: geoDailyFacts.id });

  await db
    .delete(geoImportBatches)
    .where(
      and(
        eq(geoImportBatches.projectId, input.projectId),
        eq(geoImportBatches.id, input.batchId),
      ),
    );

  return { deletedCount: deletedFacts.length };
}

export async function getGeoEvidenceSummary(projectId: string) {
  const [batches, facts] = await Promise.all([
    db
      .select()
      .from(geoImportBatches)
      .where(eq(geoImportBatches.projectId, projectId))
      .orderBy(desc(geoImportBatches.importedAt))
      .limit(20),
    db
      .select()
      .from(geoDailyFacts)
      .where(eq(geoDailyFacts.projectId, projectId))
      .orderBy(desc(geoDailyFacts.factDate))
      .limit(5000),
  ]);

  const bingFacts = facts.filter((f) => f.source === "bing_ai_csv");
  const googleFacts = facts.filter((f) => f.source === "google_genai_csv");

  return {
    projectId,
    // Strictly separated: NEVER combine Bing AI citations and Google GenAI impressions.
    bingAi: {
      metricName: "bing_ai_citations" as const,
      totalCitations: bingFacts.reduce((s, r) => s + r.metricValue, 0),
      distinctCitedPages: new Set(
        bingFacts.map((r) => r.pageUrl).filter(Boolean),
      ).size,
      rowCount: bingFacts.length,
      completeness:
        bingFacts.length > 0 ? ("sampled" as const) : ("unknown" as const),
      rows: bingFacts.slice(0, 100),
    },
    googleGenAi: {
      metricName: "google_genai_impressions" as const,
      totalImpressions: googleFacts.reduce((s, r) => s + r.metricValue, 0),
      distinctPages: new Set(googleFacts.map((r) => r.pageUrl).filter(Boolean))
        .size,
      rowCount: googleFacts.length,
      completeness:
        googleFacts.length > 0 ? ("sampled" as const) : ("unknown" as const),
      rows: googleFacts.slice(0, 100),
    },
    batches,
  };
}
