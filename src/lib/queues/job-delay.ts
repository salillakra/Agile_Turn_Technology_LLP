/**
 * BullMQ delayed jobs: `delay` is milliseconds from enqueue time until the job becomes active.
 * @see https://docs.bullmq.io/guide/jobs/delayed
 */

/** Send first interview reminder this long before `Application.interviewDate`. */
export const INTERVIEW_REMINDER_24H_MS = 24 * 60 * 60 * 1000;

/** Send final interview reminder this long before `Application.interviewDate`. */
export const INTERVIEW_REMINDER_1H_MS = 60 * 60 * 1000;

/** @deprecated Use {@link INTERVIEW_REMINDER_24H_MS}. */
export const INTERVIEW_REMINDER_LEAD_MS = INTERVIEW_REMINDER_24H_MS;

/** Default wait before a second embedding pass after recommendations (env override). */
export const DEFAULT_RECOMMENDATION_EMBEDDING_RETRY_DELAY_MS = 90_000;

export type DelayedJobScheduleOptions = {
  /** Milliseconds from now (BullMQ `delay`). Must be >= 0. */
  delay?: number;
  /** Absolute UTC instant — converted to `delay` from now (clamped to 0). */
  runAt?: Date;
};

/** Milliseconds from `now` until `target` (0 if target is in the past). */
export function delayMsUntil(target: Date, nowMs: number = Date.now()): number {
  return Math.max(0, target.getTime() - nowMs);
}

/** When to fire an interview reminder email (`leadMs` before interview). */
export function interviewReminderRunAt(
  interviewDate: Date,
  leadMs: number = INTERVIEW_REMINDER_24H_MS
): Date {
  if (!Number.isFinite(leadMs) || leadMs < 0) {
    throw new Error("interviewReminderRunAt: leadMs must be a non-negative finite number");
  }
  return new Date(interviewDate.getTime() - leadMs);
}

/**
 * Resolve BullMQ `delay` from `delay` and/or `runAt`.
 * `runAt` wins when both are provided.
 */
export function resolveJobDelayMs(
  schedule?: DelayedJobScheduleOptions
): number | undefined {
  if (!schedule) return undefined;

  if (schedule.runAt != null) {
    const at = schedule.runAt;
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
      throw new Error("resolveJobDelayMs: runAt must be a valid Date");
    }
    return delayMsUntil(at);
  }

  if (schedule.delay != null) {
    const ms = schedule.delay;
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error("resolveJobDelayMs: delay must be a non-negative finite number");
    }
    return Math.floor(ms);
  }

  return undefined;
}

export function getRecommendationEmbeddingRetryDelayMs(): number {
  const raw = process.env.RECOMMENDATION_EMBEDDING_RETRY_DELAY_MS?.trim();
  if (!raw) return DEFAULT_RECOMMENDATION_EMBEDDING_RETRY_DELAY_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RECOMMENDATION_EMBEDDING_RETRY_DELAY_MS;
  return n;
}
