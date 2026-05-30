import { resolveEmailPreferenceCategory } from "@/src/lib/email/email-preference-categories";

/** Human labels for dashboard `byEmailType` rows. */
export const EMAIL_TYPE_LABELS: Record<string, string> = {
  stage_updates: "Stage updates",
  interview_reminders: "Interview reminders",
  marketing_emails: "Marketing",
  transactional: "Transactional (required)",
  password_reset: "Password reset",
  offer_sent: "Offer sent",
  interview_scheduled: "Interview scheduled",
  interview_rescheduled: "Interview rescheduled",
  interview_cancelled: "Interview cancelled",
  interview_panel_notice: "Interview panel notice",
  interview_reminder: "Interview reminder",
  interview_reminder_interviewer: "Interview reminder (interviewer)",
  interview_notification: "Interview notification",
  stage_update: "Stage update",
  application_received: "Application received",
};

const TRANSACTIONAL_TEMPLATES = new Set([
  "password_reset",
  "offer_sent",
  "interview_scheduled",
  "interview_rescheduled",
  "interview_cancelled",
  "interview_panel_notice",
  "interview_notification",
  "application_received",
]);

/**
 * Resolve dashboard `emailType` filter to Prisma `template in [...]` or category grouping key.
 */
export function resolveEmailTypeFilter(
  emailType: string
): { mode: "all" } | { mode: "template"; template: string } | { mode: "templates"; templates: string[] } | { mode: "category"; category: string } {
  const key = emailType.trim().toLowerCase() || "all";
  if (key === "all") return { mode: "all" };

  if (key === "transactional") {
    return { mode: "templates", templates: [...TRANSACTIONAL_TEMPLATES] };
  }

  if (key === "stage_updates") {
    return {
      mode: "templates",
      templates: ["stage_update", "stage_changed", "candidate_stage_update"],
    };
  }

  if (key === "interview_reminders") {
    return {
      mode: "templates",
      templates: ["interview_reminder", "interview_reminder_interviewer"],
    };
  }

  if (key === "marketing_emails" || key === "marketing") {
    return {
      mode: "templates",
      templates: ["marketing", "marketing_newsletter", "marketing_promo"],
    };
  }

  if (TRANSACTIONAL_TEMPLATES.has(key) || resolveEmailPreferenceCategory(key)) {
    return { mode: "template", template: key };
  }

  return { mode: "template", template: key };
}

/** Grouping key for `byEmailType` aggregation. */
export function emailTypeGroupKey(template: string): string {
  const t = template.trim().toLowerCase();
  const category = resolveEmailPreferenceCategory(t);
  if (category) return category;
  if (TRANSACTIONAL_TEMPLATES.has(t)) return "transactional";
  return t;
}

export function labelForEmailType(key: string): string {
  return EMAIL_TYPE_LABELS[key] ?? key.replace(/_/g, " ");
}
