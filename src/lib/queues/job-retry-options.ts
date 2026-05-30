import type { JobsOptions } from "bullmq";

/**
 * Retry rounds after the first failure (not counting the initial run).
 * BullMQ `attempts` = 1 + MAX_JOB_RETRIES → 4 total runs.
 */
export const MAX_JOB_RETRIES = 3;

/** Total runs BullMQ will attempt before moving the job to failed. */
export const BULLMQ_MAX_ATTEMPTS = 1 + MAX_JOB_RETRIES;

/** Base delay (ms) for exponential backoff between retries. */
export const DEFAULT_EXPONENTIAL_BACKOFF_DELAY_MS = 5_000;

/**
 * Shared retry policy for ATS background jobs:
 * - automatic retry on transient failure
 * - exponential backoff
 * - at most {@link MAX_JOB_RETRIES} retries after the first attempt
 */
export const STANDARD_JOB_RETRY_OPTIONS: JobsOptions = {
  attempts: BULLMQ_MAX_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: DEFAULT_EXPONENTIAL_BACKOFF_DELAY_MS,
  },
  removeOnComplete: { age: 86_400, count: 500 },
  removeOnFail: false,
};

export function mergeJobRetryOptions(overrides?: Partial<JobsOptions>): JobsOptions {
  return {
    ...STANDARD_JOB_RETRY_OPTIONS,
    ...overrides,
    backoff: overrides?.backoff ?? STANDARD_JOB_RETRY_OPTIONS.backoff,
  };
}

/** Max retry count from a BullMQ job instance (for logging). */
export function resolveMaxRetries(jobAttempts: number | undefined): number {
  const attempts = jobAttempts ?? BULLMQ_MAX_ATTEMPTS;
  return Math.max(0, attempts - 1);
}
