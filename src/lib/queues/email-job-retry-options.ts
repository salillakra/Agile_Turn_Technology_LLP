import type { JobsOptions } from "bullmq";
import {
  BULLMQ_MAX_ATTEMPTS,
  DEFAULT_EXPONENTIAL_BACKOFF_DELAY_MS,
  MAX_JOB_RETRIES,
  mergeJobRetryOptions,
} from "@/src/lib/queues/job-retry-options";

/** Retries after the first attempt for email jobs (default 3 → 4 total runs). */
export function getEmailJobMaxRetries(): number {
  const raw = process.env.EMAIL_JOB_MAX_RETRIES?.trim();
  if (!raw) return MAX_JOB_RETRIES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 10) return MAX_JOB_RETRIES;
  return n;
}

export function getEmailJobMaxAttempts(): number {
  return 1 + getEmailJobMaxRetries();
}

/** Base delay (ms) for exponential backoff between email send retries. */
export function getEmailJobBackoffDelayMs(): number {
  const raw = process.env.EMAIL_JOB_BACKOFF_DELAY_MS?.trim();
  if (!raw) return DEFAULT_EXPONENTIAL_BACKOFF_DELAY_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1_000) return DEFAULT_EXPONENTIAL_BACKOFF_DELAY_MS;
  return n;
}

/**
 * Email queue retry policy: automatic retries, exponential backoff, retain failed jobs for audit.
 */
export function mergeEmailJobRetryOptions(
  overrides?: Partial<JobsOptions>
): JobsOptions {
  const emailDefaults: Partial<JobsOptions> = {
    attempts: getEmailJobMaxAttempts(),
    backoff: {
      type: "exponential",
      delay: getEmailJobBackoffDelayMs(),
    },
    removeOnFail: { age: 604_800, count: 2_000 },
  };

  return mergeJobRetryOptions({
    ...emailDefaults,
    ...overrides,
    backoff: overrides?.backoff ?? emailDefaults.backoff,
    attempts: overrides?.attempts ?? emailDefaults.attempts,
  });
}

export { BULLMQ_MAX_ATTEMPTS };
