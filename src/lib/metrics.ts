import type { ApplicationStage } from "@prisma/client";

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

export function calculateActivePipelineCount(
  totalApplications: number,
  hiredCount: number,
  rejectedCount: number
): number {
  const value = totalApplications - hiredCount - rejectedCount;
  return value > 0 ? value : 0;
}

/** Generic ratio in [0, 1], 2 d.p.; denominator 0 → 0. Used for per-source hire/offer reach rates. */
export function calculateFraction(numerator: number, denominator: number): number {
  return roundToTwo(safeDivide(numerator, denominator));
}

export function calculateOfferRate(
  offerCount: number,
  totalApplications: number
): number {
  return roundToTwo(safeDivide(offerCount, totalApplications));
}

export function calculateConversionRate(
  hiredCount: number,
  totalApplications: number
): number {
  return roundToTwo(safeDivide(hiredCount, totalApplications));
}

export function calculateAverageTimeToHire(days: number[]): number {
  if (!Array.isArray(days) || days.length === 0) return 0;
  const total = days.reduce((sum, value) => sum + value, 0);
  return roundToTwo(safeDivide(total, days.length));
}

/**
 * Percent change from previous → current: ((current - previous) / previous) * 100.
 * Returns null when previous === 0 and current > 0 (undefined relative baseline).
 */
export function calculatePercentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return roundToTwo(((current - previous) / previous) * 100);
}

const STAGES_PAST_APPLIED: ApplicationStage[] = [
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
];

const STAGES_SCREENING_OR_LATER: ApplicationStage[] = [
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
];

const STAGES_INTERVIEW_OR_LATER: ApplicationStage[] = [
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
];

function sumStageCounts(
  stageCounts: Map<ApplicationStage, number>,
  stages: ApplicationStage[]
): number {
  return stages.reduce((acc, s) => acc + (stageCounts.get(s) ?? 0), 0);
}

/**
 * Stage snapshot funnel (current `Application.stage` only; not full history).
 *
 * - appliedToScreeningRate: reached SCREENING+ / all applications (REJECTED and APPLIED in denominator).
 * - screeningToInterviewRate: reached INTERVIEW+ / apps at SCREENING+ (excludes APPLIED and REJECTED from denominator).
 * - interviewToHireRate: HIRED / apps at INTERVIEW+ (excludes APPLIED, SCREENING, REJECTED from denominator).
 */
export function computeDashboardFunnelRates(stageCounts: Map<ApplicationStage, number>): {
  appliedToScreeningRate: number;
  screeningToInterviewRate: number;
  interviewToHireRate: number;
} {
  const totalApplications = Array.from(stageCounts.values()).reduce((a, b) => a + b, 0);
  const pastApplied = sumStageCounts(stageCounts, STAGES_PAST_APPLIED);
  const screeningPool = sumStageCounts(stageCounts, STAGES_SCREENING_OR_LATER);
  const interviewOrLater = sumStageCounts(stageCounts, STAGES_INTERVIEW_OR_LATER);
  const hiredCount = stageCounts.get("HIRED") ?? 0;

  return {
    appliedToScreeningRate: roundToTwo(safeDivide(pastApplied, totalApplications)),
    screeningToInterviewRate: roundToTwo(safeDivide(interviewOrLater, screeningPool)),
    interviewToHireRate: roundToTwo(safeDivide(hiredCount, interviewOrLater)),
  };
}



