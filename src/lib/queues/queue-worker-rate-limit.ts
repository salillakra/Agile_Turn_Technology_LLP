import type { RateLimiterOptions } from "bullmq";

/** Default: max embedding jobs started per window (each calls `ai-service` /embed). */
export const DEFAULT_EMBEDDING_WORKER_RATE_MAX = 12;
export const DEFAULT_EMBEDDING_WORKER_RATE_DURATION_MS = 60_000;

/**
 * Default: max email jobs **started** per window (BullMQ worker `limiter`).
 * Align with {@link DEFAULT_EMAIL_OUTBOUND_GLOBAL_MAX} in `email-outbound-rate-limit.ts`.
 */
export const DEFAULT_EMAIL_WORKER_RATE_MAX = 25;
export const DEFAULT_EMAIL_WORKER_RATE_DURATION_MS = 60_000;

/** Parallel SMTP workers — keep low vs provider limits (see `EMAIL_WORKER_CONCURRENCY`). */
export const DEFAULT_EMAIL_WORKER_CONCURRENCY = 3;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function parseDurationMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1_000) return fallback;
  return n;
}

export function getEmbeddingWorkerRateLimiter(): RateLimiterOptions {
  return {
    max: parsePositiveInt(
      process.env.QUEUE_EMBEDDING_WORKER_RATE_MAX,
      DEFAULT_EMBEDDING_WORKER_RATE_MAX
    ),
    duration: parseDurationMs(
      process.env.QUEUE_EMBEDDING_WORKER_RATE_DURATION_MS,
      DEFAULT_EMBEDDING_WORKER_RATE_DURATION_MS
    ),
  };
}

export function getEmailWorkerRateLimiter(): RateLimiterOptions {
  return {
    max: parsePositiveInt(process.env.QUEUE_EMAIL_WORKER_RATE_MAX, DEFAULT_EMAIL_WORKER_RATE_MAX),
    duration: parseDurationMs(
      process.env.QUEUE_EMAIL_WORKER_RATE_DURATION_MS,
      DEFAULT_EMAIL_WORKER_RATE_DURATION_MS
    ),
  };
}

/** BullMQ worker concurrency for `ats-email` (independent of limiter window). */
export function getEmailWorkerConcurrency(): number {
  const max = parsePositiveInt(
    process.env.EMAIL_WORKER_CONCURRENCY,
    DEFAULT_EMAIL_WORKER_CONCURRENCY
  );
  const limiterMax = getEmailWorkerRateLimiter().max;
  return Math.min(max, Math.max(1, limiterMax));
}

export function formatWorkerRateLimiter(
  name: string,
  limiter: RateLimiterOptions
): string {
  const perSec = (limiter.max / (limiter.duration / 1000)).toFixed(2);
  return `${name}: max=${limiter.max}/${limiter.duration}ms (~${perSec}/s)`;
}
