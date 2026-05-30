/**
 * Central registry for BullMQ queue names and `Queue` instances.
 *
 * API routes import from here — not `new Queue()` scattered across handlers.
 * Workers subscribe to the same names in `workers/`.
 */

import { Queue, type QueueOptions } from "bullmq";
import { mergeJobRetryOptions } from "@/src/lib/queues/job-retry-options";
import { getQueueConnectionOptions } from "@/src/lib/queues/redis";
import {
  closeEmailQueue,
  getEmailQueue as getTransactionalEmailQueue,
  EMAIL_QUEUE_NAME,
} from "@/src/lib/queues/email-queue";
import {
  closeEmbeddingQueue,
  getEmbeddingQueue,
  EMBEDDING_QUEUE_NAME,
} from "@/src/lib/queues/embedding-queue";
import {
  closeResumeParsingQueue,
  getResumeParsingQueue,
  RESUME_PARSING_QUEUE_NAME,
} from "@/src/lib/queues/resume-parsing-queue";
import {
  ANALYTICS_QUEUE_NAME,
  closeAnalyticsQueue,
  getAnalyticsQueue,
} from "@/src/lib/queues/analytics-queue";

/** Redis key namespace prefix for all ATS background jobs. */
export const QUEUE_NAMES = {
  RESUME_PARSING: RESUME_PARSING_QUEUE_NAME,
  /** @deprecated Use {@link QUEUE_NAMES.RESUME_PARSING} */
  PARSE: RESUME_PARSING_QUEUE_NAME,
  EMBEDDING: EMBEDDING_QUEUE_NAME,
  /** @deprecated Use {@link QUEUE_NAMES.EMBEDDING} */
  EMBED: EMBEDDING_QUEUE_NAME,
  EMAIL: EMAIL_QUEUE_NAME,
  ANALYTICS: ANALYTICS_QUEUE_NAME,
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job name constants per queue (processor routing). */
export const JOB_NAMES = {
  PARSE_RESUME: "resume.parse",
  EMBED_JOB: "job.embed",
  EMBED_CANDIDATE: "candidate.embed",
  EMAIL_TRANSACTIONAL: "email.transactional",
  ANALYTICS_DASHBOARD: "analytics.dashboard",
  ANALYTICS_REPORTS: "analytics.reports",
} as const;

function baseQueueOptions(): QueueOptions {
  return {
    connection: getQueueConnectionOptions(),
    defaultJobOptions: mergeJobRetryOptions(),
  };
}

const queueInstances = new Map<QueueName, Queue>();

function getOrCreateQueue(name: QueueName, options?: Partial<QueueOptions>): Queue {
  const existing = queueInstances.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    ...baseQueueOptions(),
    ...options,
  });
  queueInstances.set(name, queue);
  return queue;
}

/** Résumé parse jobs — see `resume-parsing-queue.ts`. */
export function getParseQueue(): Queue {
  return getResumeParsingQueue();
}

/** Semantic embedding generation — see `embedding-queue.ts`. */
export function getEmbedQueue(): Queue {
  return getEmbeddingQueue();
}

/** Transactional email — see `email-queue.ts`. */
export function getEmailQueue(): Queue {
  return getTransactionalEmailQueue();
}

/** Dashboard/report cache warm and aggregates — see `analytics-queue.ts`. */
export { getAnalyticsQueue } from "@/src/lib/queues/analytics-queue";

/** All registered queues (Bull Board, graceful shutdown). */
export function getAllQueues(): Queue[] {
  return [
    getResumeParsingQueue(),
    getEmbeddingQueue(),
    getTransactionalEmailQueue(),
    getAnalyticsQueue(),
  ];
}

/** Close every queue instance (API shutdown). Does not quit Redis — use `closeQueueRedisConnections`. */
export async function closeAllQueues(): Promise<void> {
  const queues = [...queueInstances.values()];
  queueInstances.clear();
  await Promise.allSettled([
    ...queues.map((q) => q.close()),
    closeResumeParsingQueue(),
    closeEmbeddingQueue(),
    closeEmailQueue(),
    closeAnalyticsQueue(),
  ]);
}
