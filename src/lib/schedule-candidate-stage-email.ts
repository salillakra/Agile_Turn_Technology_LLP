import { after } from "next/server";
import {
  notifyCandidateStageChangeEmailDeferred,
  type CandidateStageUpdateEmailPayload,
} from "@/src/lib/notification-service";

/**
 * Post-response hook for PATCH stage → candidate email workflow.
 *
 * 1. Application `stage` is already persisted (caller runs this after commit).
 * 2. `after()` runs {@link notifyCandidateStageChangeEmailDeferred} → `enqueueEmailJob` (Redis).
 * 3. `email` BullMQ worker → `processEmailJob` → `sendTransactionalEmail` (separate process).
 *
 * Does not await SMTP; does not block the HTTP response.
 */
export function scheduleCandidateStageChangeEmail(
  payload: CandidateStageUpdateEmailPayload
): void {
  after(async () => {
    await notifyCandidateStageChangeEmailDeferred(payload);
  });
}
