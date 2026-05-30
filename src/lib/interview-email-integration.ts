/**
 * Interview workflow ↔ asynchronous email system (BullMQ `ats:email` queue).
 *
 * | Lifecycle event | Candidate template | Interviewer template | Delivery |
 * |-----------------|-------------------|----------------------|----------|
 * | Scheduled | `interview_scheduled` | `interview_panel_notice` (kind=scheduled) | Immediate job |
 * | Rescheduled | `interview_rescheduled` | `interview_panel_notice` (kind=rescheduled) | Immediate job |
 * | Cancelled | `interview_cancelled` | `interview_panel_notice` (kind=cancelled) | Immediate job |
 * | Reminder 24h / 1h | `interview_reminder` | `interview_reminder_interviewer` | Delayed job |
 *
 * Entry points (post-response via `after()`):
 * - {@link scheduleInterviewScheduledCommunications}
 * - {@link scheduleInterviewRescheduledCommunications}
 * - {@link scheduleInterviewCancelledCommunications}
 *
 * Requires Redis (`REDIS_URL`) and `npm run worker` (email worker).
 */

export {
  scheduleInterviewScheduledCommunications,
  scheduleInterviewRescheduledCommunications,
  scheduleInterviewCancelledCommunications,
  type InterviewRescheduleEmailOptions,
  type InterviewCancelEmailOptions,
} from "@/src/lib/interview-email-orchestration";

export {
  refreshInterviewReminderJobs,
  clearInterviewReminderJobs,
} from "@/src/lib/interview-reminder-integration";

export { loadInterviewEmailContext } from "@/src/lib/interview-email-context";

export { enqueueInterviewScheduledEmail } from "@/src/lib/enqueue-interview-scheduled";
export { enqueueInterviewRescheduledEmail } from "@/src/lib/enqueue-interview-rescheduled";
export { enqueueInterviewCancelledEmail } from "@/src/lib/enqueue-interview-cancelled";
export {
  scheduleInterviewReminderEmails,
  scheduleInterviewEntityReminderEmails,
} from "@/src/lib/enqueue-interview-reminder";
