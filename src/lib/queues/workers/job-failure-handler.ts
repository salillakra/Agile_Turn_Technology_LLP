import type { Job } from "bullmq";
import { BULLMQ_MAX_ATTEMPTS } from "@/src/lib/queues/job-retry-options";
import { persistDomainFailureForExhaustedJob } from "@/src/lib/queues/workers/domain-queue-failures";
import {
  readQueueJobFailureMeta,
  serializeJobError,
} from "@/src/lib/queues/workers/job-failure-record";
import { isUnrecoverableError } from "@/src/lib/queues/workers/worker-errors";
import { logJobRetryFailure } from "@/src/lib/queues/workers/retry-logging";

function resolveMaxAttempts(job: Job | undefined): number {
  return job?.opts?.attempts ?? BULLMQ_MAX_ATTEMPTS;
}

function isJobPermanentlyFailed(job: Job | undefined, error: unknown): boolean {
  if (!job) return true;
  if (isUnrecoverableError(error)) return true;
  const attemptsMade = job.attemptsMade ?? 0;
  const maxAttempts = resolveMaxAttempts(job);
  return attemptsMade >= maxAttempts;
}

/**
 * Called from the BullMQ `failed` event — logs retry vs exhausted and persists domain failure state.
 * Never throws (avoids crashing the worker on audit writes).
 */
export async function handleQueueJobFailedEvent(
  workerName: string,
  queueName: string,
  job: Job | undefined,
  error: unknown
): Promise<void> {
  try {
    logJobRetryFailure(workerName, job, error);

    if (!job || !isJobPermanentlyFailed(job, error)) {
      return;
    }

    const serialized = serializeJobError(error);
    const meta = readQueueJobFailureMeta(job.data);

    await persistDomainFailureForExhaustedJob(queueName, job, serialized, meta);
  } catch (handlerErr) {
    console.error(
      `[worker:${workerName}] handleQueueJobFailedEvent error job=${job?.id ?? "?"}`,
      handlerErr instanceof Error ? handlerErr.message : handlerErr
    );
  }
}
