import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { getSharedRedisClient } from "@/src/lib/redis-connection";

/** Mutations (create + reschedule) per user per sliding window. */
export const DEFAULT_INTERVIEW_SCHEDULING_RATE_MAX = 30;
export const DEFAULT_INTERVIEW_SCHEDULING_RATE_WINDOW_MS = 60_000;

export type ConsumeInterviewSchedulingRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const REDIS_KEY_PREFIX = "recruitment:interview-schedule:ratelimit:v1:";
const memoryBuckets = new Map<string, number[]>();

function getRedisClient() {
  return getSharedRedisClient("cache");
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

export function getInterviewSchedulingRateLimitConfig(): {
  max: number;
  windowMs: number;
} {
  return {
    max: parsePositiveInt(
      process.env.INTERVIEW_SCHEDULING_RATE_MAX,
      DEFAULT_INTERVIEW_SCHEDULING_RATE_MAX
    ),
    windowMs: parseWindowMs(
      process.env.INTERVIEW_SCHEDULING_RATE_WINDOW_MS,
      DEFAULT_INTERVIEW_SCHEDULING_RATE_WINDOW_MS
    ),
  };
}

function consumeInMemory(
  key: string,
  max: number,
  windowMs: number
): ConsumeInterviewSchedulingRateLimitResult {
  const now = Date.now();
  const pruned = (memoryBuckets.get(key) ?? [])
    .filter((t) => now - t < windowMs)
    .sort((a, b) => a - b);

  if (pruned.length >= max) {
    const oldest = pruned[0]!;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  pruned.push(now);
  memoryBuckets.set(key, pruned);
  return { ok: true };
}

async function consumeSlidingWindow(
  userId: string
): Promise<ConsumeInterviewSchedulingRateLimitResult> {
  const { max, windowMs } = getInterviewSchedulingRateLimitConfig();
  const key = userId.trim() || "__no_user__";
  const r = getRedisClient();
  if (!r) {
    return consumeInMemory(key, max, windowMs);
  }

  const redisKey = `${REDIS_KEY_PREFIX}${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 12)}`;

  try {
    await r.zremrangebyscore(redisKey, 0, windowStart);
    const count = await r.zcard(redisKey);
    if (count >= max) {
      const oldestRows = await r.zrange(redisKey, 0, 0, "WITHSCORES");
      const oldestScore =
        oldestRows.length >= 2
          ? Number.parseFloat(oldestRows[1]!)
          : now - windowMs;
      const retryAfterMs = Math.max(0, windowMs - (now - oldestScore));
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }
    await r.zadd(redisKey, now, member);
    await r.pexpire(redisKey, windowMs);
    return { ok: true };
  } catch {
    return consumeInMemory(key, max, windowMs);
  }
}

export async function consumeInterviewSchedulingRateLimit(
  userId: string | undefined
): Promise<ConsumeInterviewSchedulingRateLimitResult> {
  if (typeof userId !== "string" || !userId.trim()) {
    return { ok: true };
  }
  return consumeSlidingWindow(userId);
}

export function interviewSchedulingRateLimitedResponse(
  retryAfterSeconds: number
): NextResponse {
  const { max, windowMs } = getInterviewSchedulingRateLimitConfig();
  const retry = Math.max(1, retryAfterSeconds);
  const res = apiError(
    "RATE_LIMITED",
    `Too many interview scheduling requests. Limit is ${max} per ${windowMs / 1000} seconds per user.`,
    429,
    {
      limit: max,
      windowSeconds: windowMs / 1000,
      retryAfterSeconds: retry,
    }
  );
  res.headers.set("Retry-After", String(retry));
  return res;
}

/**
 * Returns 429 when the user exceeds scheduling mutation limits; otherwise null.
 */
export async function checkInterviewSchedulingRateLimit(
  userId: string | undefined
): Promise<NextResponse | null> {
  const result = await consumeInterviewSchedulingRateLimit(userId);
  if (result.ok === false) {
    return interviewSchedulingRateLimitedResponse(result.retryAfterSeconds);
  }
  return null;
}
