/**
 * Job health score (0–100) for prioritization. Weighted blend of normalized sub-scores.
 *
 * Factors (explicit weights):
 * - **Age**: days since `Job.createdAt` — older requisitions score lower (stale / at-risk).
 * - **Pipeline**: non-withdrawn application count — zero pipeline is weak; marginal returns after ~20.
 * - **Conversion**: `HIRED / total` among non-withdrawn applications.
 * - **Offer rate**: `(OFFER_SENT + HIRED) / total` — share that reached offer stage or hire.
 *
 * Assumption: "days open" uses `createdAt` for all statuses; OPEN roles are the primary intent for ranking.
 */
const WEIGHT_AGE = 0.25;
const WEIGHT_PIPELINE = 0.25;
const WEIGHT_CONVERSION = 0.3;
const WEIGHT_OFFER = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value);
}

/** 100 at age 0 → floors near 25 by ~75 days (tunable). */
function scoreAgeDays(ageDaysOpen: number): number {
  const a = Math.max(0, ageDaysOpen);
  return clamp(100 - (a / 75) * 70, 25, 100);
}

/** 0 pipeline → very low; ramps toward 100 around ~20 active applications. */
function scorePipelineSize(pipelineSize: number): number {
  if (pipelineSize <= 0) return 12;
  return Math.min(100, Math.round(12 + pipelineSize * 4.4));
}

export type JobHealthScoreInput = {
  /** Calendar age of the requisition in whole days (`Job.createdAt` → now). */
  ageDaysOpen: number;
  /** Non-withdrawn applications for the job. */
  pipelineSize: number;
  /** Hired count / pipeline size (0–1). */
  conversionRate: number;
  /** (OFFER_SENT + HIRED) count / pipeline size (0–1). */
  offerRate: number;
};

export function computeJobHealthScore(input: JobHealthScoreInput): number {
  const age = scoreAgeDays(input.ageDaysOpen);
  const pipe = scorePipelineSize(input.pipelineSize);
  const conv = clamp01(input.conversionRate) * 100;
  const offer = clamp01(input.offerRate) * 100;

  const blended =
    age * WEIGHT_AGE +
    pipe * WEIGHT_PIPELINE +
    conv * WEIGHT_CONVERSION +
    offer * WEIGHT_OFFER;

  return clamp(Math.round(blended), 0, 100);
}
