/**
 * BullMQ queue for low-priority dashboard / report cache refresh.
 * Consumers: analytics worker (future); producers schedule background warm jobs.
 */

import { Queue, type QueueOptions } from "bullmq";
import { mergeJobRetryOptions } from "@/src/lib/queues/job-retry-options";
import { resolveJobDelayMs, type DelayedJobScheduleOptions } from "@/src/lib/queues/job-delay";
import { JOB_PRIORITY_LOW } from "@/src/lib/queues/job-priority";
import { getQueueConnectionOptions } from "@/src/lib/queues/redis";
import { BULLMQ_QUEUE_NAMES } from "@/src/lib/queues/queue-names";
import { sanitizeBullmqJobId } from "@/src/lib/queues/bullmq-job-id";

/** Redis queue name for analytics refresh jobs (no `:` — BullMQ v5+ restriction). */
export const ANALYTICS_QUEUE_NAME = BULLMQ_QUEUE_NAMES.ANALYTICS;

const ANALYTICS_JOB_NAMES = {
  DASHBOARD: "analytics.dashboard",
  REPORTS: "analytics.reports",
} as const;

export type AnalyticsRefreshScope = "dashboard" | "reports";

export type AnalyticsRefreshPayload = {
  scope: AnalyticsRefreshScope;
  /** Cache key or route identifier to warm (e.g. `dashboard:summary:ADMIN:...`). */
  cacheKey: string;
  userId?: string;
  role?: string;
};

export type EnqueueAnalyticsRefreshOptions = DelayedJobScheduleOptions & {
  jobId?: string;
  /** Override default LOW priority (discouraged). */
  priority?: number;
};

let queueInstance: Queue<AnalyticsRefreshPayload> | null = null;

function analyticsQueueOptions(): QueueOptions {
  return {
    connection: getQueueConnectionOptions(),
    defaultJobOptions: mergeJobRetryOptions({
      priority: JOB_PRIORITY_LOW,
      removeOnComplete: { age: 86_400, count: 200 },
    }),
  };
}

export function getAnalyticsQueue(): Queue<AnalyticsRefreshPayload> {
  if (!queueInstance) {
    queueInstance = new Queue<AnalyticsRefreshPayload>(
      ANALYTICS_QUEUE_NAME,
      analyticsQueueOptions()
    );
  }
  return queueInstance;
}

function jobNameForScope(scope: AnalyticsRefreshScope): string {
  return scope === "reports"
    ? ANALYTICS_JOB_NAMES.REPORTS
    : ANALYTICS_JOB_NAMES.DASHBOARD;
}

function defaultJobId(payload: AnalyticsRefreshPayload): string {
  const slug = payload.cacheKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80);
  return `analytics:${payload.scope}:${slug}`;
}

/**
 * Enqueue a low-priority analytics cache refresh job.
 */
export async function enqueueAnalyticsRefresh(
  payload: AnalyticsRefreshPayload,
  options?: EnqueueAnalyticsRefreshOptions
): Promise<string> {
  if (!payload.cacheKey?.trim()) {
    throw new Error("enqueueAnalyticsRefresh: cacheKey is required");
  }
  const scope = payload.scope;
  if (scope !== "dashboard" && scope !== "reports") {
    throw new Error(`enqueueAnalyticsRefresh: invalid scope "${scope}"`);
  }

  const normalized: AnalyticsRefreshPayload = {
    scope,
    cacheKey: payload.cacheKey.trim(),
    userId: payload.userId?.trim() || undefined,
    role: payload.role?.trim() || undefined,
  };

  const job = await getAnalyticsQueue().add(jobNameForScope(scope), normalized, {
    jobId: sanitizeBullmqJobId(options?.jobId ?? defaultJobId(normalized)),
    delay: resolveJobDelayMs(options),
    priority: options?.priority ?? JOB_PRIORITY_LOW,
  });

  if (!job.id) {
    throw new Error("enqueueAnalyticsRefresh: BullMQ did not return a job id");
  }
  return job.id;
}

export const analyticsQueue = {
  name: ANALYTICS_QUEUE_NAME,
  enqueue: enqueueAnalyticsRefresh,
  get instance() {
    return getAnalyticsQueue();
  },
} as const;

export async function closeAnalyticsQueue(): Promise<void> {
  if (!queueInstance) return;
  const q = queueInstance;
  queueInstance = null;
  await q.close();
}
