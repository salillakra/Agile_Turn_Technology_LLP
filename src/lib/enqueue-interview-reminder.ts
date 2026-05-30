import {
  buildInterviewReminderInterviewerSubject,
  buildInterviewReminderSubject,
} from "@/src/lib/application-stage-labels";
import { enqueueEmailJob, getEmailQueue } from "@/src/lib/queues/email-queue";
import {
  delayMsUntil,
  INTERVIEW_REMINDER_1H_MS,
  INTERVIEW_REMINDER_24H_MS,
  interviewReminderRunAt,
} from "@/src/lib/queues/job-delay";
import { isRedisConfigured } from "@/src/lib/queues/redis";

export type InterviewReminderLeadHours = 24 | 1;

const REMINDER_LEAD_MS: Record<InterviewReminderLeadHours, number> = {
  24: INTERVIEW_REMINDER_24H_MS,
  1: INTERVIEW_REMINDER_1H_MS,
};

/** Stable BullMQ job id per application + lead window (enables cancel/reschedule). */
export function interviewReminderJobId(
  applicationId: string,
  leadHours: InterviewReminderLeadHours
): string {
  return `email:interview-reminder:${leadHours}h:${applicationId.trim()}`;
}

/** Stable BullMQ job id per `Interview` + recipient (enables cancel/reschedule). */
export function interviewEntityReminderJobId(
  interviewId: string,
  leadHours: InterviewReminderLeadHours,
  recipientKey: string
): string {
  return `email:interview-reminder:${leadHours}h:iv:${interviewId.trim()}:${recipientKey}`;
}

/** Remove all pending delayed interview reminders for an application. */
export async function cancelInterviewReminderEmails(
  applicationId: string
): Promise<void> {
  if (!isRedisConfigured()) return;

  for (const lead of [24, 1] as const) {
    const jobId = interviewReminderJobId(applicationId, lead);
    const existing = await getEmailQueue().getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  }
}

/** @alias {@link cancelInterviewReminderEmails} */
export const cancelInterviewReminderEmail = cancelInterviewReminderEmails;

export type ScheduleInterviewReminderEmailParams = {
  applicationId: string;
  recipient: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: Date;
  interviewer?: string;
  meetingLink?: string;
  timeZone?: string;
};

export type ScheduledReminderSlot = {
  leadHours: InterviewReminderLeadHours;
  scheduled: boolean;
  delayMs?: number;
  runAt?: string;
  reason?: "window_passed" | "preference_opt_out" | "no_recipient";
};

export type ScheduleInterviewRemindersResult =
  | {
      scheduled: true;
      reminders: ScheduledReminderSlot[];
    }
  | { scheduled: false; reason: "redis_unconfigured" | "no_recipient" | "interview_in_past" };

async function scheduleOneInterviewReminder(
  params: ScheduleInterviewReminderEmailParams,
  leadHours: InterviewReminderLeadHours
): Promise<ScheduledReminderSlot> {
  const leadMs = REMINDER_LEAD_MS[leadHours];
  const interviewAt = params.interviewDate;
  const runAt = interviewReminderRunAt(interviewAt, leadMs);

  if (runAt.getTime() <= Date.now()) {
    const staleId = interviewReminderJobId(params.applicationId, leadHours);
    const stale = await getEmailQueue().getJob(staleId);
    if (stale) await stale.remove();
    return { leadHours, scheduled: false, reason: "window_passed" };
  }

  const delayMs = delayMsUntil(runAt);
  const subject = buildInterviewReminderSubject(params.jobTitle, leadHours);

  const enqueueResult = await enqueueEmailJob(
    {
      recipient: params.recipient,
      subject,
      template: "interview_reminder",
      data: {
        applicationId: params.applicationId,
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
        interviewDate: interviewAt.toISOString(),
        reminderAt: runAt.toISOString(),
        reminderLeadHours: leadHours,
        interviewer: params.interviewer?.trim() ?? "",
        meetingLink: params.meetingLink?.trim() ?? "",
        ...(params.timeZone ? { timeZone: params.timeZone } : {}),
      },
    },
    {
      jobId: interviewReminderJobId(params.applicationId, leadHours),
      delay: delayMs,
    }
  );

  if (!enqueueResult.enqueued) {
    return { leadHours, scheduled: false, reason: "preference_opt_out" };
  }

  return {
    leadHours,
    scheduled: true,
    delayMs,
    runAt: runAt.toISOString(),
  };
}

/**
 * Queue 24h and 1h `interview_reminder` emails (BullMQ delayed jobs).
 * Replaces any existing reminders for the same application.
 */
export async function scheduleInterviewReminderEmails(
  params: ScheduleInterviewReminderEmailParams
): Promise<ScheduleInterviewRemindersResult> {
  if (!isRedisConfigured()) {
    return { scheduled: false, reason: "redis_unconfigured" };
  }

  const recipient = params.recipient?.trim();
  if (!recipient) {
    return { scheduled: false, reason: "no_recipient" };
  }

  const interviewAt = params.interviewDate;
  if (!(interviewAt instanceof Date) || Number.isNaN(interviewAt.getTime())) {
    throw new Error("scheduleInterviewReminderEmails: interviewDate must be a valid Date");
  }

  if (interviewAt.getTime() <= Date.now()) {
    await cancelInterviewReminderEmails(params.applicationId);
    return { scheduled: false, reason: "interview_in_past" };
  }

  await cancelInterviewReminderEmails(params.applicationId);

  const reminders = await Promise.all([
    scheduleOneInterviewReminder(params, 24),
    scheduleOneInterviewReminder(params, 1),
  ]);

  const anyScheduled = reminders.some((r) => r.scheduled);
  if (!anyScheduled) {
    return { scheduled: false, reason: "interview_in_past" };
  }

  return { scheduled: true, reminders };
}

/**
 * @deprecated Use {@link scheduleInterviewReminderEmails} (schedules 24h + 1h).
 */
export async function scheduleInterviewReminderEmail(
  params: ScheduleInterviewReminderEmailParams
): Promise<
  | { scheduled: true; delayMs: number; runAt: string }
  | { scheduled: false; reason: "redis_unconfigured" | "no_recipient" | "interview_in_past" }
> {
  const result = await scheduleInterviewReminderEmails(params);
  if (result.scheduled === false) {
    return { scheduled: false, reason: result.reason };
  }
  const slot24 = result.reminders.find((r) => r.leadHours === 24 && r.scheduled);
  if (slot24?.delayMs != null && slot24.runAt) {
    return { scheduled: true, delayMs: slot24.delayMs, runAt: slot24.runAt };
  }
  const slot1 = result.reminders.find((r) => r.leadHours === 1 && r.scheduled);
  if (slot1?.delayMs != null && slot1.runAt) {
    return { scheduled: true, delayMs: slot1.delayMs, runAt: slot1.runAt };
  }
  return { scheduled: false, reason: "interview_in_past" };
}

export function scheduleInterviewReminderEmailsBestEffort(
  params: ScheduleInterviewReminderEmailParams
): void {
  void scheduleInterviewReminderEmails(params).catch((err) => {
    console.error("[interview-reminder] schedule failed:", err);
  });
}

/** @deprecated Use {@link scheduleInterviewReminderEmailsBestEffort}. */
export const scheduleInterviewReminderEmailBestEffort =
  scheduleInterviewReminderEmailsBestEffort;

export function clearInterviewReminderEmailsBestEffort(applicationId: string): void {
  void cancelInterviewReminderEmails(applicationId).catch((err) => {
    console.error("[interview-reminder] cancel failed:", err);
  });
}

/** @alias {@link clearInterviewReminderEmailsBestEffort} */
export const clearInterviewReminderEmailBestEffort = clearInterviewReminderEmailsBestEffort;

export type InterviewEntityReminderRecipient =
  | { kind: "candidate"; email: string; name: string }
  | { kind: "interviewer"; userId: string; email: string; name: string };

export type ScheduleInterviewEntityRemindersParams = {
  interviewId: string;
  applicationId: string;
  interviewDate: Date;
  jobTitle: string;
  candidateName: string;
  meetingLink?: string;
  timeZone?: string;
  /** Shown on candidate reminder emails. */
  interviewerDisplay?: string;
  recipients: readonly InterviewEntityReminderRecipient[];
};

/** Remove all pending delayed reminders for an `Interview` (candidate + interviewers). */
export async function cancelInterviewEntityReminderEmails(
  interviewId: string,
  interviewerUserIds: readonly string[] = []
): Promise<void> {
  if (!isRedisConfigured()) return;

  const recipientKeys = [
    "candidate",
    ...interviewerUserIds.map((id) => `user:${id.trim()}`),
  ];

  for (const lead of [24, 1] as const) {
    for (const key of recipientKeys) {
      const jobId = interviewEntityReminderJobId(interviewId, lead, key);
      const existing = await getEmailQueue().getJob(jobId);
      if (existing) {
        await existing.remove();
      }
    }
  }
}

export function clearInterviewEntityReminderEmailsBestEffort(
  interviewId: string,
  interviewerUserIds: readonly string[] = []
): void {
  void cancelInterviewEntityReminderEmails(interviewId, interviewerUserIds).catch((err) => {
    console.error("[interview-reminder] entity cancel failed:", err);
  });
}

async function scheduleOneInterviewEntityReminder(
  params: ScheduleInterviewEntityRemindersParams,
  recipient: InterviewEntityReminderRecipient,
  leadHours: InterviewReminderLeadHours
): Promise<ScheduledReminderSlot> {
  const leadMs = REMINDER_LEAD_MS[leadHours];
  const interviewAt = params.interviewDate;
  const runAt = interviewReminderRunAt(interviewAt, leadMs);

  const recipientKey =
    recipient.kind === "candidate" ? "candidate" : `user:${recipient.userId}`;

  if (runAt.getTime() <= Date.now()) {
    const staleId = interviewEntityReminderJobId(params.interviewId, leadHours, recipientKey);
    const stale = await getEmailQueue().getJob(staleId);
    if (stale) await stale.remove();
    return { leadHours, scheduled: false, reason: "window_passed" };
  }

  const delayMs = delayMsUntil(runAt);
  const isInterviewer = recipient.kind === "interviewer";
  const subject = isInterviewer
    ? buildInterviewReminderInterviewerSubject(params.jobTitle, leadHours)
    : buildInterviewReminderSubject(params.jobTitle, leadHours);

  const template = isInterviewer ? "interview_reminder_interviewer" : "interview_reminder";
  const email = recipient.email.trim();
  if (!email) {
    return { leadHours, scheduled: false, reason: "no_recipient" };
  }

  const enqueueResult = await enqueueEmailJob(
    {
      recipient: email,
      subject,
      template,
      data: {
        applicationId: params.applicationId,
        interviewId: params.interviewId,
        candidateName: params.candidateName,
        jobTitle: params.jobTitle,
        interviewDate: interviewAt.toISOString(),
        reminderAt: runAt.toISOString(),
        reminderLeadHours: leadHours,
        interviewer: params.interviewerDisplay?.trim() ?? "",
        meetingLink: params.meetingLink?.trim() ?? "",
        ...(isInterviewer ? { interviewerName: recipient.name } : {}),
        ...(params.timeZone ? { timeZone: params.timeZone } : {}),
      },
    },
    {
      jobId: interviewEntityReminderJobId(params.interviewId, leadHours, recipientKey),
      delay: delayMs,
    }
  );

  if (!enqueueResult.enqueued) {
    return { leadHours, scheduled: false, reason: "preference_opt_out" };
  }

  return {
    leadHours,
    scheduled: true,
    delayMs,
    runAt: runAt.toISOString(),
  };
}

export type ScheduleInterviewEntityRemindersResult =
  | {
      scheduled: true;
      reminders: ScheduledReminderSlot[];
    }
  | { scheduled: false; reason: "redis_unconfigured" | "no_recipients" | "interview_in_past" };

/**
 * Queue 24h + 1h delayed `interview_reminder` emails for candidate and each interviewer
 * on an `Interview` record (BullMQ delayed jobs).
 */
export async function scheduleInterviewEntityReminderEmails(
  params: ScheduleInterviewEntityRemindersParams
): Promise<ScheduleInterviewEntityRemindersResult> {
  if (!isRedisConfigured()) {
    return { scheduled: false, reason: "redis_unconfigured" };
  }

  const interviewAt = params.interviewDate;
  if (!(interviewAt instanceof Date) || Number.isNaN(interviewAt.getTime())) {
    throw new Error("scheduleInterviewEntityReminderEmails: interviewDate must be a valid Date");
  }

  const interviewerUserIds = params.recipients
    .filter((r): r is Extract<InterviewEntityReminderRecipient, { kind: "interviewer" }> => r.kind === "interviewer")
    .map((r) => r.userId);

  if (interviewAt.getTime() <= Date.now()) {
    await cancelInterviewEntityReminderEmails(params.interviewId, interviewerUserIds);
    return { scheduled: false, reason: "interview_in_past" };
  }

  const recipients = params.recipients.filter((r) => r.email.trim());
  if (recipients.length === 0) {
    return { scheduled: false, reason: "no_recipients" };
  }

  await cancelInterviewEntityReminderEmails(params.interviewId, interviewerUserIds);

  const reminders: ScheduledReminderSlot[] = [];
  for (const recipient of recipients) {
    for (const lead of [24, 1] as const) {
      reminders.push(await scheduleOneInterviewEntityReminder(params, recipient, lead));
    }
  }

  const anyScheduled = reminders.some((r) => r.scheduled);
  if (!anyScheduled) {
    return { scheduled: false, reason: "interview_in_past" };
  }

  return { scheduled: true, reminders };
}

export function scheduleInterviewEntityReminderEmailsBestEffort(
  params: ScheduleInterviewEntityRemindersParams
): void {
  void scheduleInterviewEntityReminderEmails(params).catch((err) => {
    console.error("[interview-reminder] entity schedule failed:", err);
  });
}
