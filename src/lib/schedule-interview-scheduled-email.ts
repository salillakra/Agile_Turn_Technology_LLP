import { after } from "next/server";
import {
  enqueueInterviewScheduledEmail,
  type InterviewScheduledEmailPayload,
} from "@/src/lib/enqueue-interview-scheduled";

/** Post-response enqueue for interview scheduled email (does not block HTTP). */
export function scheduleInterviewScheduledEmail(
  payload: InterviewScheduledEmailPayload
): void {
  after(async () => {
    await enqueueInterviewScheduledEmail(payload);
  });
}
