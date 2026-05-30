import type { Job } from "bullmq";
import {
  BULLMQ_MAX_ATTEMPTS,
  resolveMaxRetries,
} from "@/src/lib/queues/job-retry-options";
import { isUnrecoverableError } from "@/src/lib/queues/workers/worker-errors";

function resolveMaxAttempts(job: Job | undefined): number {
  return job?.opts?.attempts ?? BULLMQ_MAX_ATTEMPTS;
}

/** Log when a job starts a retry run (not the first attempt). */
export function logJobRetryActive(workerName: string, job: Job): void {
  if (job.attemptsMade <= 0) return;

  const maxAttempts = resolveMaxAttempts(job);
  const maxRetries = resolveMaxRetries(maxAttempts);
  const runNumber = job.attemptsMade + 1;

  console.warn(
    `[worker:${workerName}] retry run ${job.attemptsMade}/${maxRetries} job=${job.id} name=${job.name} (execution ${runNumber}/${maxAttempts})`
  );
}

/** Log after failure — either schedules another retry or exhausts attempts. */
export function logJobRetryFailure(
  workerName: string,
  job: Job | undefined,
  error: unknown
): void {
  const jobId = job?.id ?? "?";
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = resolveMaxAttempts(job);
  const maxRetries = resolveMaxRetries(maxAttempts);
  const unrecoverable = isUnrecoverableError(error);
  const message = error instanceof Error ? error.message : String(error);

  const willRetry = !unrecoverable && attemptsMade < maxAttempts;

  if (willRetry) {
    const nextRetryNumber = attemptsMade;
    console.warn(
      `[worker:${workerName}] retry scheduled ${nextRetryNumber}/${maxRetries} job=${jobId} backoff=exponential error=${message}`
    );
    return;
  }

  console.error(
    `[worker:${workerName}] retries exhausted job=${jobId} attempts=${attemptsMade}/${maxAttempts} unrecoverable=${unrecoverable} error=${message}`
  );
}
