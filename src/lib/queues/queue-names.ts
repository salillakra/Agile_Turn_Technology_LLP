/**
 * Canonical BullMQ queue names (Redis list keys).
 *
 * BullMQ v5+ rejects `:` in queue names — use hyphens only (`ats-resume-parsing`, not `ats:resume-parsing`).
 */
export const BULLMQ_QUEUE_NAMES = {
  RESUME_PARSING: "ats-resume-parsing",
  EMBEDDING: "ats-embedding",
  EMAIL: "ats-email",
  ANALYTICS: "ats-analytics",
} as const;

export type BullMqQueueName =
  (typeof BULLMQ_QUEUE_NAMES)[keyof typeof BULLMQ_QUEUE_NAMES];

/** Fail fast with a clear message before BullMQ throws "Queue name cannot contain :". */
export function assertValidBullMqQueueName(name: string): asserts name is BullMqQueueName {
  if (!name || typeof name !== "string") {
    throw new Error("BullMQ queue name is required");
  }
  if (name.includes(":")) {
    throw new Error(
      `Invalid BullMQ queue name "${name}": queue names cannot contain ":" (BullMQ v5+). ` +
        `Expected names like "${BULLMQ_QUEUE_NAMES.RESUME_PARSING}". ` +
        `Update queue * constants in src/lib/queues/*-queue.ts, then restart npm run worker.`
    );
  }
}

export function listBullMqQueueNames(): readonly BullMqQueueName[] {
  return Object.values(BULLMQ_QUEUE_NAMES);
}
