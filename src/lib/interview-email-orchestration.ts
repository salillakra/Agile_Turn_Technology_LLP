import { after } from "next/server";
import { enqueueInterviewCancelledEmail } from "@/src/lib/enqueue-interview-cancelled";
import { enqueueInterviewPanelNoticeEmail } from "@/src/lib/enqueue-interview-panel-notice";
import { enqueueInterviewRescheduledEmail } from "@/src/lib/enqueue-interview-rescheduled";
import { enqueueInterviewScheduledEmail } from "@/src/lib/enqueue-interview-scheduled";
import {
  loadInterviewEmailContext,
  type InterviewEmailContext,
} from "@/src/lib/interview-email-context";
import { refreshInterviewReminderJobs, clearInterviewReminderJobs } from "@/src/lib/interview-reminder-integration";

export type InterviewRescheduleEmailOptions = {
  previousScheduledAt: Date;
};

export type InterviewCancelEmailOptions = {
  cancellationReason: string;
};

async function dispatchInterviewScheduledEmails(ctx: InterviewEmailContext): Promise<void> {
  if (ctx.candidateEmail) {
    await enqueueInterviewScheduledEmail({
      interviewId: ctx.interviewId,
      applicationId: ctx.applicationId,
      jobId: ctx.jobId,
      recipient: ctx.candidateEmail,
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      interviewDate: ctx.scheduledAt,
      interviewer: ctx.interviewerDisplay,
      meetingLink: ctx.meetingLink ?? undefined,
    });
  }

  for (const interviewer of ctx.interviewers) {
    await enqueueInterviewPanelNoticeEmail({
      interviewId: ctx.interviewId,
      applicationId: ctx.applicationId,
      recipient: interviewer.email,
      interviewerName: interviewer.name,
      interviewerUserId: interviewer.userId,
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      interviewDate: ctx.scheduledAt,
      kind: "scheduled",
      meetingLink: ctx.meetingLink ?? undefined,
    });
  }
}

async function dispatchInterviewRescheduledEmails(
  ctx: InterviewEmailContext,
  options: InterviewRescheduleEmailOptions
): Promise<void> {
  if (ctx.candidateEmail) {
    await enqueueInterviewRescheduledEmail({
      interviewId: ctx.interviewId,
      applicationId: ctx.applicationId,
      recipient: ctx.candidateEmail,
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      interviewDate: ctx.scheduledAt,
      previousInterviewDate: options.previousScheduledAt,
      interviewer: ctx.interviewerDisplay,
      meetingLink: ctx.meetingLink ?? undefined,
    });
  }

  for (const interviewer of ctx.interviewers) {
    await enqueueInterviewPanelNoticeEmail({
      interviewId: ctx.interviewId,
      applicationId: ctx.applicationId,
      recipient: interviewer.email,
      interviewerName: interviewer.name,
      interviewerUserId: interviewer.userId,
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      interviewDate: ctx.scheduledAt,
      previousInterviewDate: options.previousScheduledAt,
      kind: "rescheduled",
      meetingLink: ctx.meetingLink ?? undefined,
    });
  }
}

async function dispatchInterviewCancelledEmails(
  ctx: InterviewEmailContext,
  options: InterviewCancelEmailOptions
): Promise<void> {
  if (ctx.candidateEmail) {
    await enqueueInterviewCancelledEmail({
      interviewId: ctx.interviewId,
      applicationId: ctx.applicationId,
      jobId: ctx.jobId,
      recipient: ctx.candidateEmail,
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      interviewDate: ctx.scheduledAt,
      cancellationReason: options.cancellationReason,
      interviewer: ctx.interviewerDisplay,
    });
  }

  for (const interviewer of ctx.interviewers) {
    await enqueueInterviewPanelNoticeEmail({
      interviewId: ctx.interviewId,
      applicationId: ctx.applicationId,
      recipient: interviewer.email,
      interviewerName: interviewer.name,
      interviewerUserId: interviewer.userId,
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      interviewDate: ctx.scheduledAt,
      kind: "cancelled",
      cancellationReason: options.cancellationReason,
    });
  }
}

async function refreshInterviewEntityReminders(interviewId: string): Promise<void> {
  const result = await refreshInterviewReminderJobs(interviewId);
  if (result.scheduled) {
    const scheduledCount = result.reminders.filter((r) => r.scheduled).length;
    console.info(
      "[interview-reminder] queued %s delayed job(s) for interview %s",
      scheduledCount,
      interviewId
    );
  }
}

/** Post-response: scheduled emails + entity reminders (24h / 1h). */
export function scheduleInterviewScheduledCommunications(interviewId: string): void {
  after(async () => {
    const ctx = await loadInterviewEmailContext(interviewId);
    if (!ctx) return;
    await dispatchInterviewScheduledEmails(ctx);
    await refreshInterviewEntityReminders(interviewId);
  });
}

/** Post-response: rescheduled emails + refresh entity reminders. */
export function scheduleInterviewRescheduledCommunications(
  interviewId: string,
  options: InterviewRescheduleEmailOptions
): void {
  after(async () => {
    const ctx = await loadInterviewEmailContext(interviewId);
    if (!ctx) return;
    await dispatchInterviewRescheduledEmails(ctx, options);
    await refreshInterviewEntityReminders(interviewId);
  });
}

/** Post-response: cancellation emails + clear delayed reminder jobs. */
export function scheduleInterviewCancelledCommunications(
  interviewId: string,
  options: InterviewCancelEmailOptions
): void {
  after(async () => {
    const ctx = await loadInterviewEmailContext(interviewId);
    if (!ctx) return;
    await dispatchInterviewCancelledEmails(ctx, options);
    await clearInterviewReminderJobs(
      interviewId,
      ctx.interviewers.map((i) => i.userId)
    );
  });
}
