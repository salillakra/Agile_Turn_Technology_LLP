import { getSharedRedisClient } from "@/src/lib/redis-connection";

/** Producer-side cap: embedding jobs added to Redis per sliding window (all API/workers). */
export const DEFAULT_EMBEDDING_ENQUEUE_RATE_MAX = 120;
export const DEFAULT_EMBEDDING_ENQUEUE_RATE_WINDOW_MS = 60_000;

/** Producer-side cap: email jobs enqueued per sliding window. */
export const DEFAULT_EMAIL_ENQUEUE_RATE_MAX = 60;
export const DEFAULT_EMAIL_ENQUEUE_RATE_WINDOW_MS = 60_000;

export type QueueEnqueueKind = "embedding" | "email";

export type ConsumeEnqueueRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export class QueueEnqueueRateLimitedError extends Error {
  readonly queueKind: QueueEnqueueKind;
  readonly retryAfterSeconds: number;

  constructor(queueKind: QueueEnqueueKind, retryAfterSeconds: number) {
    super(
      `Queue enqueue rate limited (${queueKind}); retry after ${retryAfterSeconds} second(s)`
    );
    this.name = "QueueEnqueueRateLimitedError";
    this.queueKind = queueKind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const REDIS_KEY_PREFIX = "recruitment:queue:enqueue-ratelimit:v1:";
const memoryBuckets = new Map<string, number[]>();

function getRedisClient() {
  return getSharedRedisClient("cache");
}

function configFor(kind: QueueEnqueueKind): { max: number; windowMs: number } {
  if (kind === "embedding") {
    return {
      max: parsePositiveInt(
        process.env.QUEUE_EMBEDDING_ENQUEUE_RATE_MAX,
        DEFAULT_EMBEDDING_ENQUEUE_RATE_MAX
      ),
      windowMs: parseWindowMs(
        process.env.QUEUE_EMBEDDING_ENQUEUE_RATE_WINDOW_MS,
        DEFAULT_EMBEDDING_ENQUEUE_RATE_WINDOW_MS
      ),
    };
  }
  return {
    max: parsePositiveInt(process.env.QUEUE_EMAIL_ENQUEUE_RATE_MAX, DEFAULT_EMAIL_ENQUEUE_RATE_MAX),
    windowMs: parseWindowMs(
      process.env.QUEUE_EMAIL_ENQUEUE_RATE_WINDOW_MS,
      DEFAULT_EMAIL_ENQUEUE_RATE_WINDOW_MS
    ),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function parseWindowMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1_000) return fallback;
  return n;
}

function redisKey(kind: QueueEnqueueKind): string {
  return `${REDIS_KEY_PREFIX}${kind}`;
}

function consumeInMemory(bucketKey: string, max: number, windowMs: number): ConsumeEnqueueRateLimitResult {
  const now = Date.now();
  const pruned = (memoryBuckets.get(bucketKey) ?? [])
    .filter((t) => now - t < windowMs)
    .sort((a, b) => a - b);

  if (pruned.length >= max) {
    const oldest = pruned[0]!;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    memoryBuckets.set(bucketKey, pruned);
    return { ok: false, retryAfterSeconds };
  }

  pruned.push(now);
  memoryBuckets.set(bucketKey, pruned);
  return { ok: true };
}

/**
 * Sliding-window limiter before `Queue.add` — caps burst enqueue from API routes.
 * Uses Redis when configured; otherwise per-process memory (dev only).
 */
export async function consumeQueueEnqueueRateLimit(
  kind: QueueEnqueueKind
): Promise<ConsumeEnqueueRateLimitResult> {
  const { max, windowMs } = configFor(kind);
  const r = getRedisClient();
  if (!r) {
    return consumeInMemory(kind, max, windowMs);
  }

  const key = redisKey(kind);
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 12)}`;

  try {
    await r.zremrangebyscore(key, 0, windowStart);
    const count = await r.zcard(key);
    if (count >= max) {
      const oldestRows = await r.zrange(key, 0, 0, "WITHSCORES");
      const oldestScore =
        oldestRows.length >= 2 ? Number.parseFloat(oldestRows[1]!) : now - windowMs;
      const retryAfterMs = Math.max(0, windowMs - (now - oldestScore));
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return { ok: false, retryAfterSeconds };
    }
    await r.zadd(key, now, member);
    await r.pexpire(key, windowMs);
    return { ok: true };
  } catch {
    return consumeInMemory(kind, max, windowMs);
  }
}

export async function assertQueueEnqueueRateLimit(kind: QueueEnqueueKind): Promise<void> {
  const result = await consumeQueueEnqueueRateLimit(kind);
  if (!result.ok) {
    throw new QueueEnqueueRateLimitedError(kind, result.retryAfterSeconds);
  }
}

export function formatEnqueueRateLimit(kind: QueueEnqueueKind): string {
  const { max, windowMs } = configFor(kind);
  return `${kind}-enqueue: max=${max}/${windowMs}ms`;
}
