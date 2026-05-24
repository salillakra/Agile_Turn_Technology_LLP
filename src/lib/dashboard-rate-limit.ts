import { NextResponse } from "next/server";
import Redis from "ioredis";

/** Max dashboard API GETs per user per sliding window (aligned with common per-minute quotas). */
export const DASHBOARD_RATE_LIMIT_MAX = 60;

/** Sliding window length in milliseconds (1 minute). */
export const DASHBOARD_RATE_LIMIT_WINDOW_MS = 60_000;

type ConsumeResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const REDIS_KEY_PREFIX = "recruitment:dashboard:ratelimit:v1:";
const buckets = new Map<string, number[]>();

let redisClient: Redis | null = null;
let redisDisabledUntil = 0;
const REDIS_BACKOFF_MS = 30_000;

function redisUrl(): string | undefined {
  return process.env.REDIS_URL?.trim() || undefined;
}

function getRedisClient(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  if (Date.now() < redisDisabledUntil) return null;
  if (redisClient) return redisClient;
  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", () => {
      redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
      try {
        void redisClient?.quit();
      } catch {
        /* ignore */
      }
      redisClient = null;
    });
    redisClient = client;
    return client;
  } catch {
    redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    return null;
  }
}

function rateLimitRedisKey(userId: string): string {
  return `${REDIS_KEY_PREFIX}${userId}`;
}

function consumeInMemory(bucketKey: string): ConsumeResult {
  const now = Date.now();
  const pruned = (buckets.get(bucketKey) ?? [])
    .filter((t) => now - t < DASHBOARD_RATE_LIMIT_WINDOW_MS)
    .sort((a, b) => a - b);

  if (pruned.length >= DASHBOARD_RATE_LIMIT_MAX) {
    const oldest = pruned[0]!;
    const retryAfterMs = Math.max(0, DASHBOARD_RATE_LIMIT_WINDOW_MS - (now - oldest));
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    buckets.set(bucketKey, pruned);
    return { ok: false as const, retryAfterSeconds };
  }

  pruned.push(now);
  buckets.set(bucketKey, pruned);
  return { ok: true as const };
}

/**
 * Sliding-window limiter shared across dashboard GET routes.
 * When `REDIS_URL` is set, counts are stored in Redis (multi-instance safe); otherwise falls back
 * to the same in-memory buckets as before (per Node process).
 */
export async function consumeDashboardRateLimit(userId: string | undefined): Promise<ConsumeResult> {
  const key = (userId?.trim() || "__no_user__") + ":dashboard";
  const r = getRedisClient();
  if (!r) {
    return consumeInMemory(key);
  }

  const redisKey = rateLimitRedisKey(key);
  const now = Date.now();
  const windowStart = now - DASHBOARD_RATE_LIMIT_WINDOW_MS;
  const member = `${now}:${Math.random().toString(36).slice(2, 12)}`;

  try {
    await r.zremrangebyscore(redisKey, 0, windowStart);
    const count = await r.zcard(redisKey);
    if (count >= DASHBOARD_RATE_LIMIT_MAX) {
      const oldestRows = await r.zrange(redisKey, 0, 0, "WITHSCORES");
      const oldestScore =
        oldestRows.length >= 2 ? Number.parseFloat(oldestRows[1]!) : now - DASHBOARD_RATE_LIMIT_WINDOW_MS;
      const retryAfterMs = Math.max(0, DASHBOARD_RATE_LIMIT_WINDOW_MS - (now - oldestScore));
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return { ok: false as const, retryAfterSeconds };
    }
    await r.zadd(redisKey, now, member);
    await r.pexpire(redisKey, DASHBOARD_RATE_LIMIT_WINDOW_MS);
    return { ok: true as const };
  } catch {
    redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    try {
      void r.quit();
    } catch {
      /* ignore */
    }
    redisClient = null;
    return consumeInMemory(key);
  }
}

/** HTTP 429 with `Retry-After` (RFC 7231) and standard error body. */
export function dashboardRateLimitedResponse(retryAfterSeconds: number): NextResponse {
  const retry = Math.max(1, retryAfterSeconds);
  return NextResponse.json(
    {
      code: "RATE_LIMITED",
      message: `Too many dashboard requests. Limit is ${DASHBOARD_RATE_LIMIT_MAX} requests per minute per user.`,
      details: {
        limit: DASHBOARD_RATE_LIMIT_MAX,
        windowSeconds: DASHBOARD_RATE_LIMIT_WINDOW_MS / 1000,
        retryAfterSeconds: retry,
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(retry) },
    }
  );
}
