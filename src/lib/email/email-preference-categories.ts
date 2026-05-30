import type { EmailTemplateKey } from "@/src/lib/queues/email-queue";

/**
 * User-controllable email channels (see `EmailPreference` model).
 * Other templates are transactional and bypass preference checks.
 */
export type EmailPreferenceCategory =
  | "stage_updates"
  | "interview_reminders"
  | "marketing_emails";

export type EmailPreferenceChannel = {
  stageUpdates: boolean;
  interviewReminders: boolean;
  marketingEmails: boolean;
};

/** Defaults when no `EmailPreference` row exists. */
export const DEFAULT_EMAIL_PREFERENCE_CHANNELS: EmailPreferenceChannel = {
  stageUpdates: true,
  interviewReminders: true,
  marketingEmails: false,
};

const STAGE_UPDATE_TEMPLATES = new Set([
  "stage_update",
  "stage_changed",
  "candidate_stage_update",
]);

const INTERVIEW_REMINDER_TEMPLATES = new Set([
  "interview_reminder",
  "interview_reminder_interviewer",
]);

const MARKETING_TEMPLATES = new Set([
  "marketing",
  "marketing_newsletter",
  "marketing_promo",
]);

/**
 * Map a queue template key to a preference category, or `null` if send is required
 * (password reset, offer, interview scheduled, internal recruiter alerts).
 */
export function resolveEmailPreferenceCategory(
  template: EmailTemplateKey | string
): EmailPreferenceCategory | null {
  const key = template.trim().toLowerCase();

  if (STAGE_UPDATE_TEMPLATES.has(key)) return "stage_updates";
  if (INTERVIEW_REMINDER_TEMPLATES.has(key)) return "interview_reminders";
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
    case "interview_reminders":
      return channels.interviewReminders;
    case "marketing_emails":
      return channels.marketingEmails;
    default:
      return true;
  }
}
