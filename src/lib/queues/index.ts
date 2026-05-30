/**
 * Queue infrastructure entry point.
 *
 * @example
 * import { resumeParsingQueue } from "@/src/lib/queues";
 * await resumeParsingQueue.enqueue({ candidateId, resumeUrl });
 */

export {
  MAX_JOB_RETRIES,
  BULLMQ_MAX_ATTEMPTS,
  STANDARD_JOB_RETRY_OPTIONS,
  mergeJobRetryOptions,
} from "@/src/lib/queues/job-retry-options";

export {
  getEmailJobMaxRetries,
  getEmailJobMaxAttempts,
  getEmailJobBackoffDelayMs,
  mergeEmailJobRetryOptions,
} from "@/src/lib/queues/email-job-retry-options";

export {
  assertOutboundEmailSendRateLimit,
  consumeOutboundEmailSendRateLimit,
  formatOutboundEmailRateLimits,
  DEFAULT_EMAIL_OUTBOUND_GLOBAL_MAX,
  DEFAULT_EMAIL_OUTBOUND_RECIPIENT_MAX,
} from "@/src/lib/queues/email-outbound-rate-limit";

export {
  JOB_PRIORITY_HIGH,
  JOB_PRIORITY_MEDIUM,
  JOB_PRIORITY_LOW,
  JOB_PRIORITY_BY_TIER,
  jobPriorityForTier,
  resolveEmailJobPriority,
  type JobPriorityTier,
} from "@/src/lib/queues/job-priority";

export {
  getEmbeddingWorkerRateLimiter,
  getEmailWorkerRateLimiter,
  formatWorkerRateLimiter,
  DEFAULT_EMBEDDING_WORKER_RATE_MAX,
  DEFAULT_EMAIL_WORKER_RATE_MAX,
} from "@/src/lib/queues/queue-worker-rate-limit";

export {
  consumeQueueEnqueueRateLimit,
  assertQueueEnqueueRateLimit,
  QueueEnqueueRateLimitedError,
  formatEnqueueRateLimit,
  DEFAULT_EMBEDDING_ENQUEUE_RATE_MAX,
  DEFAULT_EMAIL_ENQUEUE_RATE_MAX,
  type QueueEnqueueKind,
  type ConsumeEnqueueRateLimitResult,
} from "@/src/lib/queues/queue-enqueue-rate-limit";

export {
  INTERVIEW_REMINDER_LEAD_MS,
  INTERVIEW_REMINDER_24H_MS,
  INTERVIEW_REMINDER_1H_MS,
  DEFAULT_RECOMMENDATION_EMBEDDING_RETRY_DELAY_MS,
  delayMsUntil,
  interviewReminderRunAt,
  resolveJobDelayMs,
  getRecommendationEmbeddingRetryDelayMs,
  type DelayedJobScheduleOptions,
} from "@/src/lib/queues/job-delay";

export {
  closeQueueRedisConnections,
  createWorkerRedisConnection,
  closeWorkerRedisConnection,
  getQueueRedisConnection,
  getQueueConnectionOptions,
  isRedisConfigured,
  getRedisTargetDescription,
  type QueueRedisConnection,
} from "@/src/lib/queues/redis";

export {
  QUEUE_NAMES,
  JOB_NAMES,
  getParseQueue,
  getEmbedQueue,
  getEmailQueue,
  getAnalyticsQueue,
  getAllQueues,
  closeAllQueues,
  type QueueName,
} from "@/src/lib/queues/queues";

export {
  resumeParsingQueue,
  getResumeParsingQueue,
  enqueueResumeParsingJob,
  closeResumeParsingQueue,
  RESUME_PARSING_QUEUE_NAME,
  RESUME_PARSING_JOB_NAME,
  type ResumeParsingJobPayload,
  type EnqueueResumeParsingJobOptions,
} from "@/src/lib/queues/resume-parsing-queue";

export {
  embeddingQueue,
  getEmbeddingQueue,
  enqueueEmbeddingJob,
  closeEmbeddingQueue,
  EMBEDDING_QUEUE_NAME,
  EMBEDDING_JOB_NAME,
  type EmbeddingEntityType,
  type EmbeddingJobPayload,
  type EnqueueEmbeddingJobOptions,
} from "@/src/lib/queues/embedding-queue";

export type {
  QueueAnalyticsSnapshot,
  QueueAnalyticsQueueRow,
  QueueBacklogCounts,
  QueueMetricsHourBucket,
  QueueAnalyticsTelemetryEvent,
} from "@/src/lib/queues/queue-analytics-types";

export {
  getQueueAnalyticsSnapshot,
  recordQueueJobCompleted,
  recordQueueJobFailed,
  recordQueueJobRetry,
  recordQueueJobStalled,
  formatUtcHourBucket,
  DEFAULT_QUEUE_ANALYTICS_WINDOW_HOURS,
  type GetQueueAnalyticsSnapshotOptions,
} from "@/src/lib/queues/queue-analytics";

export {
  shutdownQueueWorkersGracefully,
  DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS,
  type GracefulWorkerShutdownParams,
} from "@/src/lib/queues/workers/worker-graceful-shutdown";

export {
  startQueueWorkers,
  createResumeParsingWorker,
  createEmbeddingWorker,
  createEmailWorker,
  resumeParsingWorker,
  embeddingWorker,
  emailWorker,
} from "@/src/lib/queues/workers";

export {
  emailQueue,
  getEmailQueue as getTransactionalEmailQueue,
  enqueueEmailJob,
  enqueueEmailJobId,
  type EnqueueEmailJobResult,
  closeEmailQueue,
  EMAIL_QUEUE_NAME,
  EMAIL_JOB_NAME,
  type EmailTemplateKey,
  type EmailJobPayload,
  type EnqueueEmailJobOptions,
} from "@/src/lib/queues/email-queue";

export {
  analyticsQueue,
  getAnalyticsQueue,
  enqueueAnalyticsRefresh,
  closeAnalyticsQueue,
  ANALYTICS_QUEUE_NAME,
  type AnalyticsRefreshPayload,
  type AnalyticsRefreshScope,
  type EnqueueAnalyticsRefreshOptions,
} from "@/src/lib/queues/analytics-queue";
