/**
 * Interview reminder integration (BullMQ delayed jobs on `ats:email`).
 *
 * For each active `Interview` (SCHEDULED / RESCHEDULED):
 * - 24h before `scheduledAt`: delayed email to candidate + each assigned interviewer
 * - 1h before `scheduledAt`: same recipients
 *
 * Templates: `interview_reminder` (candidate), `interview_reminder_interviewer` (panel).
 * Respects `EmailPreference.interviewReminders` per recipient inbox.
 *
 * Requires Redis (`REDIS_URL`) and `npm run worker` (email worker consumes delayed jobs).
 */

export {
  scheduleInterviewEntityReminderEmails,
  scheduleInterviewEntityReminderEmailsBestEffort,
  cancelInterviewEntityReminderEmails,
  clearInterviewEntityReminderEmailsBestEffort,
  interviewEntityReminderJobId,
  type ScheduleInterviewEntityRemindersParams,
  type ScheduleInterviewEntityRemindersResult,
  type InterviewEntityReminderRecipient,
} from "@/src/lib/enqueue-interview-reminder";

export {
  loadInterviewEntityReminderParams,
  scheduleInterviewEntityRemindersAfterSet,
} from "@/src/lib/schedule-interview-entity-reminders";

import {
  cancelInterviewEntityReminderEmails,
  scheduleInterviewEntityReminderEmails,
} from "@/src/lib/enqueue-interview-reminder";
import { loadInterviewEntityReminderParams } from "@/src/lib/schedule-interview-entity-reminders";

/** Cancel then re-queue 24h + 1h reminders for all recipients on an interview. */
export async function refreshInterviewReminderJobs(interviewId: string) {
  const params = await loadInterviewEntityReminderParams(interviewId);
  if (!params) {
    return { scheduled: false as const, reason: "no_active_interview" as const };
  }
  return scheduleInterviewEntityReminderEmails(params);
}

/** Remove pending delayed reminder jobs for an interview (cancel / complete). */
export async function clearInterviewReminderJobs(
  interviewId: string,
  interviewerUserIds: readonly string[] = []
): Promise<void> {
  await cancelInterviewEntityReminderEmails(interviewId, interviewerUserIds);
}
