import { buildInterviewPanelNoticeSubject } from "@/src/lib/application-stage-labels";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { isRedisConfigured } from "@/src/lib/queues/redis";

export type InterviewPanelNoticeKind = "scheduled" | "rescheduled" | "cancelled";

export type InterviewPanelNoticePayload = {
  interviewId: string;
  applicationId: string;
  recipient: string;
  interviewerName: string;
  interviewerUserId: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: Date;
  kind: InterviewPanelNoticeKind;
  previousInterviewDate?: Date;
  meetingLink?: string;
  cancellationReason?: string;
  timeZone?: string;
};

export async function enqueueInterviewPanelNoticeEmail(
  payload: InterviewPanelNoticePayload
): Promise<void> {
  const recipient = payload.recipient?.trim();
  if (!recipient || !isRedisConfigured()) return;

  const interviewAt = payload.interviewDate;
  if (!(interviewAt instanceof Date) || Number.isNaN(interviewAt.getTime())) {
    throw new Error("enqueueInterviewPanelNoticeEmail: interviewDate must be a valid Date");
  }

  const subject = buildInterviewPanelNoticeSubject(payload.jobTitle, payload.kind);
  const jobSuffix =
    payload.kind === "scheduled"
      ? "scheduled"
      : payload.kind === "rescheduled"
        ? "rescheduled"
        : "cancelled";

  const data: Record<string, unknown> = {
    panelNoticeKind: payload.kind,
    interviewerName: payload.interviewerName,
    candidateName: payload.candidateName,
    jobTitle: payload.jobTitle,
    interviewDate: interviewAt.toISOString(),
    applicationId: payload.applicationId,
    meetingLink: payload.meetingLink?.trim() ?? "",
    ...(payload.timeZone ? { timeZone: payload.timeZone } : {}),
  };

  if (payload.kind === "rescheduled" && payload.previousInterviewDate) {
    data.previousInterviewDate = payload.previousInterviewDate.toISOString();
  }
  if (payload.kind === "cancelled" && payload.cancellationReason) {
    data.cancellationReason = payload.cancellationReason.trim();
  }

  try {
    const enqueueResult = await enqueueEmailJob(
      {
        recipient,
        subject,
        template: "interview_panel_notice",
        data,
      },
      {
        jobId: `email:interview-panel:${jobSuffix}:iv:${payload.interviewId}:user:${payload.interviewerUserId}`,
      }
    );
    if (!enqueueResult.enqueued) {
      console.warn("[interview-panel-notice] enqueue skipped (unexpected preference block)");
    }
  } catch (err) {
    if (err instanceof QueueEnqueueRateLimitedError) {
      console.warn(
        "[interview-panel-notice] enqueue rate limited retryAfter=%ss",
        err.retryAfterSeconds
      );
    } else {
      console.error("[interview-panel-notice] enqueue failed", err);
    }
  }
}
