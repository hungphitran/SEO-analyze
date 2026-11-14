export type VerdictTone = "good" | "warn" | "bad" | "neutral";

/** Colour for a URL Inspection verdict (PASS, PARTIAL, FAIL, NEUTRAL...). */
export function verdictTone(verdict: string | null): VerdictTone {
  switch (verdict) {
    case "PASS":
      return "good";
    case "PARTIAL":
      return "warn";
    case "FAIL":
      return "bad";
    default:
      return "neutral";
  }
}
