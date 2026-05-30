import {
  ACTIVITY_ACTION_EMAIL_FAILED,
  ACTIVITY_ACTION_EMAIL_SENT,
  ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT,
  buildEmailActivityDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import type { EmailJobPayload } from "@/src/lib/queues/email-queue";
import { extractEmailJobPayload } from "@/src/lib/queues/workers/email-delivery-record";
import { prisma } from "@/src/lib/prisma";
import type { Job } from "bullmq";

const INTERVIEW_REMINDER_TEMPLATES = new Set([
  "interview_reminder",
  "interview_reminder_interviewer",
]);

export type EmailActivityOutcome = "sent" | "failed";

type ResolvedEmailActivityContext = {
  applicationId: string | null;
  candidateId: string | null;
  interviewId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  reminderLeadHours: number | null;
};

function stringFromData(data: Record<string, unknown>, key: string): string | null {
  const raw = data[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function reminderLeadHoursFromData(data: Record<string, unknown>): number | null {
  const raw = data.reminderLeadHours;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function resolveEmailActivityContext(
  payload: EmailJobPayload
): Promise<ResolvedEmailActivityContext> {
  const data = payload.data;
  let applicationId = stringFromData(data, "applicationId");
  let jobId = stringFromData(data, "jobId");
  let jobTitle = stringFromData(data, "jobTitle");
  const interviewId = stringFromData(data, "interviewId");
  const reminderLeadHours = reminderLeadHoursFromData(data);

  let candidateId: string | null = null;

  if (applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        candidateId: true,
        jobId: true,
        job: { select: { title: true } },
      },
    });
    if (application) {
      candidateId = application.candidateId;
      jobId = jobId ?? application.jobId;
      jobTitle = jobTitle ?? application.job.title;
    }
  }

  return {
    applicationId,
    candidateId,
    interviewId,
    jobId,
    jobTitle,
    reminderLeadHours,
  };
}

function actionForEmailOutcome(
  template: string,
  outcome: EmailActivityOutcome
): string {
  if (outcome === "failed") return ACTIVITY_ACTION_EMAIL_FAILED;
  if (INTERVIEW_REMINDER_TEMPLATES.has(template.trim().toLowerCase())) {
    return ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT;
  }
  return ACTIVITY_ACTION_EMAIL_SENT;
}

/**
 * Append recruiter-visible audit rows when outbound email reaches a terminal delivery state.
 * Best-effort: never throws to the worker.
 */
export async function recordEmailActivityForDelivery(params: {
  job: Job;
  payload?: EmailJobPayload;
  outcome: EmailActivityOutcome;
  error?: string;
}): Promise<void> {
  try {
    const payload = params.payload ?? extractEmailJobPayload(params.job.data);
    const ctx = await resolveEmailActivityContext(payload);
    const action = actionForEmailOutcome(payload.template, params.outcome);

    const detailsObj = buildEmailActivityDetails({
      recipient: payload.recipient,
      emailType: payload.template,
      applicationId: ctx.applicationId,
      jobId: ctx.jobId,
      jobTitle: ctx.jobTitle,
      bullmqJobId: params.job.id ?? null,
      error: params.outcome === "failed" ? params.error : null,
      reminderLeadHours:
        action === ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT
          ? ctx.reminderLeadHours
          : null,
    });

    const serialized = serializeActivityLogDetails(detailsObj);
    if (serialized.ok === false) {
      console.error(
        "[email-activity] details serialize failed action=%s job=%s: %s",
        action,
        params.job.id,
        serialized.message
      );
      return;
    }

    await prisma.activityLog.create({
      data: {
        applicationId: ctx.applicationId ?? undefined,
        candidateId: ctx.candidateId ?? undefined,
        interviewId: ctx.interviewId ?? undefined,
        userId: undefined,
        action,
        details: serialized.json,
      },
    });
  } catch (err) {
    console.error(
      "[email-activity] ActivityLog write failed job=%s:",
      params.job.id,
      err instanceof Error ? err.message : err
    );
  }
}
