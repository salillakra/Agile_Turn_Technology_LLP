import type { ApplicationStage } from "@prisma/client";

/**
 * Allowed stage progression. Linear pipeline; REJECTED allowed from any active stage.
 * Prevents skipping stages or moving backwards.
 */
const ALLOWED_NEXT_STAGES: Record<ApplicationStage, ApplicationStage[]> = {
  APPLIED: ["SCREENING", "REJECTED"],
  SCREENING: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["TECHNICAL", "REJECTED"],
  TECHNICAL: ["FINAL_ROUND", "REJECTED"],
  FINAL_ROUND: ["OFFER_SENT", "REJECTED"],
  OFFER_SENT: ["HIRED", "REJECTED"],
  HIRED: [],
  REJECTED: [],
};

/**
 * Returns true if transitioning from `fromStage` to `toStage` is allowed.
 * HIRED and REJECTED are terminal; no transitions from them.
 */
export function isValidStageTransition(
  fromStage: ApplicationStage,
  toStage: ApplicationStage
): boolean {
  const allowed = ALLOWED_NEXT_STAGES[fromStage];
  return Array.isArray(allowed) && allowed.includes(toStage);
}
