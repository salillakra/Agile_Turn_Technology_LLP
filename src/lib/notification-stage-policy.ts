import type { ApplicationStage } from "@prisma/client";
import { isValidStageTransition } from "@/src/lib/application-stage-transitions";

/**
 * Whether an in-app notification should be emitted for this pipeline transition.
 *
 * Rules:
 * - **No-op** (`fromStage === toStage`) — not meaningful; do not notify.
 * - **Invalid transition** — not meaningful; callers should reject at API layer; this is defensive.
 *
 * Proof: `isValidStageTransition` is defined in `application-stage-transitions.ts` (linear pipeline + `REJECTED` from active stages).
 */
export function shouldNotifyStageChangeInApp(
  fromStage: ApplicationStage,
  toStage: ApplicationStage
): boolean {
  if (fromStage === toStage) return false;
  return isValidStageTransition(fromStage, toStage);
}
