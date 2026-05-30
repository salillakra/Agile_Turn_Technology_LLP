import { after } from "next/server";
import {
  enqueueInterviewCancelledEmail,
  type InterviewCancelledEmailPayload,
} from "@/src/lib/enqueue-interview-cancelled";

export function scheduleInterviewCancelledEmail(payload: InterviewCancelledEmailPayload): void {
  after(async () => {
    await enqueueInterviewCancelledEmail(payload);
  });
}
