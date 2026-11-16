const MAX_INCOMPLETE_SCHEMA_SAMPLES = 5;

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function hasNonEmptySchemaValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function normalizeSchemaTypes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.replace(/^https?:\/\/schema\.org\//i, "").trim())
    .filter(Boolean);
}

function inspectJsonLdNode(node: Record<string, unknown>, out: string[]) {
  if (out.length >= MAX_INCOMPLETE_SCHEMA_SAMPLES) return;
  for (const type of normalizeSchemaTypes(node["@type"])) {
    const missing: string[] = [];
    if (
      type === "Article" ||
      type === "BlogPosting" ||
      type === "NewsArticle"
    ) {
      if (!hasNonEmptySchemaValue(node.headline)) missing.push("headline");
      if (
        !hasNonEmptySchemaValue(node.datePublished) &&
        !hasNonEmptySchemaValue(node.author)
      ) {
        missing.push("datePublished/author");
      }
    } else if (type === "Product") {
      if (!hasNonEmptySchemaValue(node.name)) missing.push("name");
      if (
        !hasNonEmptySchemaValue(node.offers) &&
        !hasNonEmptySchemaValue(node.aggregateRating) &&
        !hasNonEmptySchemaValue(node.review)
      ) {
        missing.push("offers/aggregateRating");
      }
    } else if (type === "FAQPage") {
      if (!Array.isArray(node.mainEntity) || node.mainEntity.length === 0) {
        missing.push("mainEntity");
      }
    } else if (type === "BreadcrumbList") {
      if (
        !Array.isArray(node.itemListElement) ||
        node.itemListElement.length === 0
      ) {
        missing.push("itemListElement");
      }
    }
    if (missing.length > 0 && out.length < MAX_INCOMPLETE_SCHEMA_SAMPLES) {
      const label = `${type} (missing ${missing.join(", ")})`;
      if (!out.includes(label)) out.push(label);
    }
  }
}

/** Collect Rich Result schema types missing key properties. */
export function inspectJsonLdSchemaCompleteness(
  parsed: unknown,
  out: string[],
) {
  const queue = Array.isArray(parsed) ? parsed : [parsed];
  for (const entry of queue) {
    const obj = asPlainObject(entry);
    if (!obj) continue;
    inspectJsonLdNode(obj, out);
    if (Array.isArray(obj["@graph"])) {
      for (const graphItem of obj["@graph"]) {
        const graphObj = asPlainObject(graphItem);
        if (graphObj) inspectJsonLdNode(graphObj, out);
      }
    }
  }
}
