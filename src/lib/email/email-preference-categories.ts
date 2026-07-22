import type { EmailTemplateKey } from "@/src/lib/queues/email-queue";

/**
 * User-controllable email channels (see `EmailPreference` model).
 * Other templates are transactional and bypass preference checks.
 */
export type EmailPreferenceCategory =
  | "stage_updates"
  | "interview_emails"
  | "interview_reminders"
  | "offer_emails"
  | "marketing_emails";

export type EmailPreferenceChannel = {
  stageUpdates: boolean;
  interviewEmails: boolean;
  interviewReminders: boolean;
  offerEmails: boolean;
  marketingEmails: boolean;
};

/** Defaults when no `EmailPreference` row exists. */
export const DEFAULT_EMAIL_PREFERENCE_CHANNELS: EmailPreferenceChannel = {
  stageUpdates: true,
  interviewEmails: true,
  interviewReminders: true,
  offerEmails: true,
  marketingEmails: false,
};

const STAGE_UPDATE_TEMPLATES = new Set([
  "stage_update",
  "stage_changed",
  "candidate_stage_update",
]);

const INTERVIEW_EMAIL_TEMPLATES = new Set([
  "interview_scheduled",
  "interview_rescheduled",
  "interview_cancelled",
]);

const INTERVIEW_REMINDER_TEMPLATES = new Set([
  "interview_reminder",
  "interview_reminder_interviewer",
]);

const OFFER_TEMPLATES = new Set(["offer_sent"]);

const MARKETING_TEMPLATES = new Set([
  "marketing",
  "marketing_newsletter",
  "marketing_promo",
]);

/**
 * Map a queue template key to a preference category, or `null` if send is required
 * (password reset, invite, internal recruiter alerts / panel notices).
 */
export function resolveEmailPreferenceCategory(
  template: EmailTemplateKey | string
): EmailPreferenceCategory | null {
  const key = template.trim().toLowerCase();

  if (STAGE_UPDATE_TEMPLATES.has(key)) return "stage_updates";
  if (INTERVIEW_EMAIL_TEMPLATES.has(key)) return "interview_emails";
  if (INTERVIEW_REMINDER_TEMPLATES.has(key)) return "interview_reminders";
  if (OFFER_TEMPLATES.has(key)) return "offer_emails";
  if (MARKETING_TEMPLATES.has(key) || key.startsWith("marketing_")) {
    return "marketing_emails";
  }

  return null;
}

export function isChannelEnabled(
  channels: EmailPreferenceChannel,
  category: EmailPreferenceCategory
): boolean {
  switch (category) {
    case "stage_updates":
      return channels.stageUpdates;
    case "interview_emails":
      return channels.interviewEmails;
    case "interview_reminders":
      return channels.interviewReminders;
    case "offer_emails":
      return channels.offerEmails;
    case "marketing_emails":
      return channels.marketingEmails;
    default:
      return true;
  }
}
