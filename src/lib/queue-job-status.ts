/**
 * Shared queue job lifecycle labels (Postgres enums + UI).
 *
 * PENDING → queued in BullMQ, not yet picked up
 * PROCESSING → worker claimed the job
 * COMPLETED → success
 * FAILED → terminal error (retries exhausted or unrecoverable)
 */

export const QUEUE_JOB_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
} as const;

export type QueueJobStatus = (typeof QUEUE_JOB_STATUS)[keyof typeof QUEUE_JOB_STATUS];

const TERMINAL: ReadonlySet<QueueJobStatus> = new Set([
  QUEUE_JOB_STATUS.COMPLETED,
  QUEUE_JOB_STATUS.FAILED,
]);

const ACTIVE: ReadonlySet<QueueJobStatus> = new Set([
  QUEUE_JOB_STATUS.PENDING,
  QUEUE_JOB_STATUS.PROCESSING,
]);

export function isQueueJobTerminal(status: string | null | undefined): boolean {
  return status != null && TERMINAL.has(status as QueueJobStatus);
}

export function isQueueJobActive(status: string | null | undefined): boolean {
  return status != null && ACTIVE.has(status as QueueJobStatus);
}

/** resume parse ready for apply / eligibility (supports legacy `DONE` reads during migration). */
export function isResumeParseReady(status: string | null | undefined): boolean {
  return (
    status === QUEUE_JOB_STATUS.COMPLETED ||
    status === QUEUE_JOB_STATUS.PARTIAL ||
    status === "DONE"
  );
}
