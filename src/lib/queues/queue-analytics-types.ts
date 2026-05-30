import type { QueueName } from "@/src/lib/queues/queues";

/** BullMQ `getJobCounts()` shape — live backlog (point-in-time). */
export type QueueBacklogCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  /** Present when prioritized jobs exist (BullMQ 5+). */
  prioritized?: number;
};

/** Aggregated counters for a UTC hour bucket (Redis hash rollup). */
export type QueueMetricsHourBucket = {
  /** `YYYYMMDDHH` UTC */
  hour: string;
  processed: number;
  failed: number;
  retries: number;
  avgProcessingTimeMs: number | null;
};

/** Per-queue row returned by {@link getQueueAnalyticsSnapshot}. */
export type QueueAnalyticsQueueRow = {
  queueName: QueueName | string;
  /** Worker/logical label (e.g. `embedding`). */
  workerLabel: string;
  backlog: QueueBacklogCounts;
  /** Rolling window used for processed/failed/retries/avg duration. */
  windowHours: number;
  /** Sum across `windowHours` hourly buckets. */
  totals: Omit<QueueMetricsHourBucket, "hour">;
  /** Hourly breakdown (newest last). */
  buckets: QueueMetricsHourBucket[];
};

export type QueueAnalyticsSnapshot = {
  collectedAt: string;
  redisMetricsEnabled: boolean;
  queues: QueueAnalyticsQueueRow[];
};

/** Stdout JSON line (`QUEUE_ANALYTICS_TELEMETRY` not disabled). */
export type QueueAnalyticsTelemetryEvent = {
  kind: "queue_job";
  event: "completed" | "failed" | "retry" | "stalled";
  queueName: string;
  workerName: string;
  jobId?: string;
  jobName?: string;
  durationMs?: number;
  attemptsMade?: number;
  ts: string;
};
