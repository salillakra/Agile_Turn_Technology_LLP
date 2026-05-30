/**
 * BullMQ job priority (Redis sorted set score).
 * Lower numeric value = higher priority (processed before higher numbers).
 *
 * @see https://docs.bullmq.io/guide/jobs/prioritized
 */
export const JOB_PRIORITY_HIGH = 1;
export const JOB_PRIORITY_MEDIUM = 5;
export const JOB_PRIORITY_LOW = 10;

export type JobPriorityTier = "high" | "medium" | "low";

export const JOB_PRIORITY_BY_TIER: Record<JobPriorityTier, number> = {
  high: JOB_PRIORITY_HIGH,
  medium: JOB_PRIORITY_MEDIUM,
  low: JOB_PRIORITY_LOW,
};

export function jobPriorityForTier(tier: JobPriorityTier): number {
  return JOB_PRIORITY_BY_TIER[tier];
}

/** Email templates that must jump ahead of bulk background work. */
const HIGH_PRIORITY_EMAIL_TEMPLATES = new Set([
  "offer_sent",
  "interview_scheduled",
  "interview_reminder",
  "interview_reminder_interviewer",
  "interview_notification",
]);

function normalizeTemplateKey(template: string): string {
  return template.trim().toLowerCase();
}

/**
 * Resolve BullMQ priority for transactional email.
 * HIGH: interview notifications, offer emails (and `interview_*` templates).
 * MEDIUM: other templates (password reset, application received, generic stage_changed).
 */
export function resolveEmailJobPriority(
  template: string,
  data?: Record<string, unknown>
): number {
  const key = normalizeTemplateKey(template);
  if (HIGH_PRIORITY_EMAIL_TEMPLATES.has(key)) {
    return JOB_PRIORITY_HIGH;
  }
  if (key.startsWith("interview_")) {
    return JOB_PRIORITY_HIGH;
  }
  if (key === "stage_changed" || key === "stage_update" || key === "candidate_stage_update") {
    const stage =
      typeof data?.toStage === "string"
        ? data.toStage
        : typeof data?.newStage === "string"
          ? data.newStage
          : typeof data?.stage === "string"
            ? data.stage
            : "";
    const normalized = stage.toUpperCase().replace(/\s+/g, "_");
    if (
      normalized === "INTERVIEW" ||
      normalized === "OFFER_SENT" ||
      stage === "Interview" ||
      stage === "Offer sent"
    ) {
      return JOB_PRIORITY_HIGH;
    }
  }
  return JOB_PRIORITY_MEDIUM;
}
