/**
 * Queue analytics — collection + snapshot (no UI dashboard).
 *
 * - **Live backlog**: BullMQ `Queue.getJobCounts()` at read time.
 * - **Throughput / failures / retries / duration**: Redis hourly hashes (worker writes).
 * - **Telemetry**: structured JSON lines to stdout (optional).
 */

import type { Job } from "bullmq";
import { getSharedRedisClient } from "@/src/lib/redis-connection";
import { BULLMQ_MAX_ATTEMPTS } from "@/src/lib/queues/job-retry-options";
import type {
  QueueAnalyticsQueueRow,
  QueueAnalyticsSnapshot,
  QueueAnalyticsTelemetryEvent,
  QueueBacklogCounts,
  QueueMetricsHourBucket,
} from "@/src/lib/queues/queue-analytics-types";
import { getAllQueues, QUEUE_NAMES, type QueueName } from "@/src/lib/queues/queues";
import { isUnrecoverableError } from "@/src/lib/queues/workers/worker-errors";

const METRICS_KEY_PREFIX = "recruitment:queue:metrics:v1:";
const METRICS_TTL_SEC = 7 * 24 * 60 * 60;

const HASH_PROCESSED = "processed";
const HASH_FAILED = "failed";
const HASH_RETRIES = "retries";
const HASH_DURATION_SUM = "duration_ms_sum";
const HASH_DURATION_COUNT = "duration_ms_count";

/** Default hours of rollup when reading snapshots. */
export const DEFAULT_QUEUE_ANALYTICS_WINDOW_HOURS = 24;

const WORKER_LABEL_BY_QUEUE: Record<string, string> = {
  [QUEUE_NAMES.RESUME_PARSING]: "resume-parsing",
  [QUEUE_NAMES.EMBEDDING]: "embedding",
  [QUEUE_NAMES.EMAIL]: "email",
  [QUEUE_NAMES.ANALYTICS]: "analytics",
};

type MemoryBucket = Record<string, number>;

const memoryBuckets = new Map<string, MemoryBucket>();

function telemetryDisabled(): boolean {
  const v = process.env.QUEUE_ANALYTICS_TELEMETRY?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

function emitTelemetry(
  partial: Omit<QueueAnalyticsTelemetryEvent, "kind" | "ts">
): void {
  if (telemetryDisabled()) return;
  const row: QueueAnalyticsTelemetryEvent = {
    kind: "queue_job",
    ...partial,
    ts: new Date().toISOString(),
  };
  console.log(JSON.stringify(row));
}

function metricsRedis() {
  return getSharedRedisClient("cache");
}

/** UTC hour bucket key segment: `YYYYMMDDHH`. */
export function formatUtcHourBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}${m}${d}${h}`;
}

function redisMetricsKey(queueName: string, hour: string): string {
  return `${METRICS_KEY_PREFIX}${queueName}:${hour}`;
}

function memoryKey(queueName: string, hour: string): string {
  return `${queueName}:${hour}`;
}

function avgFromSumCount(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round(sum / count);
}

async function incrementMetrics(
  queueName: string,
  fields: Partial<Record<string, number>>,
  at: Date = new Date()
): Promise<void> {
  const hour = formatUtcHourBucket(at);
  const r = metricsRedis();

  if (r) {
    const key = redisMetricsKey(queueName, hour);
    try {
      const multi = r.multi();
      for (const [field, delta] of Object.entries(fields)) {
        if (delta != null && delta !== 0) {
          multi.hincrby(key, field, delta);
        }
      }
      multi.expire(key, METRICS_TTL_SEC);
      await multi.exec();
      return;
    } catch (err) {
      console.warn(
        "[queue-analytics] Redis increment failed, using in-memory fallback:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const mk = memoryKey(queueName, hour);
  const bucket = memoryBuckets.get(mk) ?? {};
  for (const [field, delta] of Object.entries(fields)) {
    if (delta != null) {
      bucket[field] = (bucket[field] ?? 0) + delta;
    }
  }
  memoryBuckets.set(mk, bucket);
}

export function jobProcessingDurationMs(job: Job): number | null {
  const started = job.processedOn;
  const finished = job.finishedOn;
  if (started == null || finished == null) return null;
  return Math.max(0, finished - started);
}

export function isJobPermanentlyFailedForMetrics(
  job: Job | undefined,
  error: unknown
): boolean {
  if (!job) return true;
  if (isUnrecoverableError(error)) return true;
  const attemptsMade = job.attemptsMade ?? 0;
  const maxAttempts = job.opts?.attempts ?? BULLMQ_MAX_ATTEMPTS;
  return attemptsMade >= maxAttempts;
}

/** Successful completion (BullMQ `completed` event). */
export function recordQueueJobCompleted(
  queueName: string,
  workerName: string,
  job: Job
): void {
  const durationMs = jobProcessingDurationMs(job);
  void incrementMetrics(queueName, {
    [HASH_PROCESSED]: 1,
    ...(durationMs != null
      ? {
          [HASH_DURATION_SUM]: durationMs,
          [HASH_DURATION_COUNT]: 1,
        }
      : {}),
  });

  emitTelemetry({
    event: "completed",
    queueName,
    workerName,
    jobId: job.id,
    jobName: job.name,
    durationMs: durationMs ?? undefined,
    attemptsMade: job.attemptsMade,
  });
}

/** Permanent failure (retries exhausted or unrecoverable). */
export function recordQueueJobFailed(
  queueName: string,
  workerName: string,
  job: Job | undefined
): void {
  void incrementMetrics(queueName, { [HASH_FAILED]: 1 });

  emitTelemetry({
    event: "failed",
    queueName,
    workerName,
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
  });
}

/** Retry execution (`active` with `attemptsMade > 0`). */
export function recordQueueJobRetry(
  queueName: string,
  workerName: string,
  job: Job
): void {
  void incrementMetrics(queueName, { [HASH_RETRIES]: 1 });

  emitTelemetry({
    event: "retry",
    queueName,
    workerName,
    jobId: job.id,
    jobName: job.name,
    attemptsMade: job.attemptsMade,
  });
}

export function recordQueueJobStalled(
  queueName: string,
  workerName: string,
  jobId: string
): void {
  emitTelemetry({
    event: "stalled",
    queueName,
    workerName,
    jobId,
  });
}

async function readHourBucket(
  queueName: string,
  hour: string
): Promise<QueueMetricsHourBucket> {
  const r = metricsRedis();
  let processed = 0;
  let failed = 0;
  let retries = 0;
  let durationSum = 0;
  let durationCount = 0;

  if (r) {
    try {
      const raw = await r.hgetall(redisMetricsKey(queueName, hour));
      processed = Number.parseInt(raw[HASH_PROCESSED] ?? "0", 10) || 0;
      failed = Number.parseInt(raw[HASH_FAILED] ?? "0", 10) || 0;
      retries = Number.parseInt(raw[HASH_RETRIES] ?? "0", 10) || 0;
      durationSum = Number.parseInt(raw[HASH_DURATION_SUM] ?? "0", 10) || 0;
      durationCount = Number.parseInt(raw[HASH_DURATION_COUNT] ?? "0", 10) || 0;
    } catch {
      /* fall through */
    }
  } else {
    const bucket = memoryBuckets.get(memoryKey(queueName, hour)) ?? {};
    processed = bucket[HASH_PROCESSED] ?? 0;
    failed = bucket[HASH_FAILED] ?? 0;
    retries = bucket[HASH_RETRIES] ?? 0;
    durationSum = bucket[HASH_DURATION_SUM] ?? 0;
    durationCount = bucket[HASH_DURATION_COUNT] ?? 0;
  }

  return {
    hour,
    processed,
    failed,
    retries,
    avgProcessingTimeMs: avgFromSumCount(durationSum, durationCount),
  };
}

function listRecentUtcHours(count: number): string[] {
  const hours: string[] = [];
  const cursor = new Date();
  cursor.setUTCMinutes(0, 0, 0);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(cursor.getTime() - i * 60 * 60 * 1000);
    hours.push(formatUtcHourBucket(d));
  }
  return hours;
}

function sumBuckets(buckets: QueueMetricsHourBucket[]): Omit<QueueMetricsHourBucket, "hour"> {
  let processed = 0;
  let failed = 0;
  let retries = 0;
  let durationSum = 0;
  let durationCount = 0;

  for (const b of buckets) {
    processed += b.processed;
    failed += b.failed;
    retries += b.retries;
    if (b.avgProcessingTimeMs != null) {
      const count = b.processed;
      durationSum += b.avgProcessingTimeMs * count;
      durationCount += count;
    }
  }

  return {
    processed,
    failed,
    retries,
    avgProcessingTimeMs: avgFromSumCount(durationSum, durationCount),
  };
}

async function readQueueBacklog(queueName: string): Promise<QueueBacklogCounts> {
  const queues = getAllQueues();
  const queue = queues.find((q) => q.name === queueName);
  if (!queue) {
    return {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
      paused: 0,
    };
  }

  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
    "completed",
    "paused",
    "prioritized"
  );

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    completed: counts.completed ?? 0,
    paused: counts.paused ?? 0,
    prioritized: counts.prioritized,
  };
}

export type GetQueueAnalyticsSnapshotOptions = {
  /** Subset of queues; default all registered queues. */
  queueNames?: QueueName[];
  /** Rolling UTC hours for processed/failed/retries/avg duration (default 24). */
  windowHours?: number;
};

/**
 * Operational snapshot for monitors, alerts, and a future admin dashboard.
 * Backlog is live; throughput metrics are hourly rollups from worker events.
 */
export async function getQueueAnalyticsSnapshot(
  options: GetQueueAnalyticsSnapshotOptions = {}
): Promise<QueueAnalyticsSnapshot> {
  const windowHours = Math.max(
    1,
    options.windowHours ?? DEFAULT_QUEUE_ANALYTICS_WINDOW_HOURS
  );
  const names =
    options.queueNames ?? (Object.values(QUEUE_NAMES) as QueueName[]);
  const hours = listRecentUtcHours(windowHours);

  const queues: QueueAnalyticsQueueRow[] = [];

  for (const queueName of names) {
    const buckets: QueueMetricsHourBucket[] = [];
    for (const hour of hours) {
      buckets.push(await readHourBucket(queueName, hour));
    }

    queues.push({
      queueName,
      workerLabel: WORKER_LABEL_BY_QUEUE[queueName] ?? queueName,
      backlog: await readQueueBacklog(queueName),
      windowHours,
      totals: sumBuckets(buckets),
      buckets,
    });
  }

  return {
    collectedAt: new Date().toISOString(),
    redisMetricsEnabled: metricsRedis() != null,
    queues,
  };
}
