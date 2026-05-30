import { stringField } from "@/src/lib/email/templates/layout";

const DEFAULT_OFFER_SUMMARY =
  "We are pleased to extend an offer for this role. Your recruiting contact will share the formal offer letter with full terms.";

const DEFAULT_NEXT_STEPS = [
  "Review the formal offer letter and attached documents when you receive them.",
  "Reply to your recruiting contact with any questions within the timeframe noted in the letter.",
  "Confirm your decision so we can coordinate onboarding.",
];

function stringArrayField(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

/** Offer summary paragraph(s) from structured or free-text fields. */
export function resolveOfferDetailsSummary(data: Record<string, unknown>): string {
  const explicit =
    stringField(data, "offerDetailsSummary") ||
    stringField(data, "offerSummary") ||
    stringField(data, "offerDetails");
  if (explicit) return explicit;

  const parts: string[] = [];
  const compensation =
    stringField(data, "compensation") || stringField(data, "salary");
  const startDate = stringField(data, "startDate") || stringField(data, "proposedStartDate");
  const location = stringField(data, "location") || stringField(data, "workLocation");

  if (compensation) parts.push(`Compensation: ${compensation}`);
  if (startDate) parts.push(`Proposed start date: ${startDate}`);
  if (location) parts.push(`Location: ${location}`);

  if (parts.length > 0) {
    return parts.join("\n");
  }

  return DEFAULT_OFFER_SUMMARY;
}

/** Ordered next-step lines for the candidate. */
export function resolveOfferNextSteps(data: Record<string, unknown>): string[] {
  const fromArray =
    stringArrayField(data, "nextSteps") || stringArrayField(data, "next_steps");
  if (fromArray.length > 0) return fromArray;

  const single = stringField(data, "nextStep");
  if (single) return [single];

  return [...DEFAULT_NEXT_STEPS];
}
