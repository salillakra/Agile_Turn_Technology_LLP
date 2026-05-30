import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { getSharedRedisClient } from "@/src/lib/redis-connection";

export type ConsumeSlidingWindowResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const memoryBuckets = new Map<string, number[]>();

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

function consumeInMemory(key: string, max: number, windowMs: number): ConsumeSlidingWindowResult {
  const now = Date.now();
  const pruned = (memoryBuckets.get(key) ?? []).filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (pruned.length >= max) {
    const oldest = pruned[0]!;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  pruned.push(now);
  memoryBuckets.set(key, pruned);
  return { ok: true };
}

async function consumeSlidingWindowRedis(
  redisKey: string,
  memKey: string,
  max: number,
  windowMs: number
): Promise<ConsumeSlidingWindowResult> {
  const r = getSharedRedisClient("cache");
  if (!r) return consumeInMemory(memKey, max, windowMs);

  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 12)}`;

  try {
    await r.zremrangebyscore(redisKey, 0, windowStart);
    const count = await r.zcard(redisKey);
    if (count >= max) {
      const oldestRows = await r.zrange(redisKey, 0, 0, "WITHSCORES");
      const oldestScore =
        oldestRows.length >= 2 ? Number.parseFloat(oldestRows[1]!) : now - windowMs;
      const retryAfterMs = Math.max(0, windowMs - (now - oldestScore));
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    await r.zadd(redisKey, now, member);
    await r.pexpire(redisKey, windowMs);
    return { ok: true };
  } catch {
    return consumeInMemory(memKey, max, windowMs);
  }
}

export async function consumeApiRateLimit(params: {
  /** Redis key prefix, versioned. Example: `recruitment:auth:ratelimit:v1:` */
  prefix: string;
  /** Scope segment (endpoint or action). Example: `forgot-password` */
  scope: string;
  /** Per-user identifier (userId for authenticated routes; email for auth flows). */
  identity: string;
  /** Max events per window. */
  max: number;
  /** Sliding window size in ms. */
  windowMs: number;
}): Promise<ConsumeSlidingWindowResult> {
  const identity = params.identity.trim();
  if (!identity) return { ok: true };
  const scope = params.scope.trim() || "default";
  const redisKey = `${params.prefix}${scope}:${identity}`;
  const memKey = `${params.prefix}${scope}:${identity}`;
  return consumeSlidingWindowRedis(redisKey, memKey, params.max, params.windowMs);
}

export function rateLimitedResponse(params: {
  message: string;
  retryAfterSeconds: number;
  limit: number;
  windowSeconds: number;
}): NextResponse {
  const retry = Math.max(1, Math.trunc(params.retryAfterSeconds));
  const res = apiError("RATE_LIMITED", params.message, 429, {
    limit: params.limit,
    windowSeconds: params.windowSeconds,
    retryAfterSeconds: retry,
  });
  res.headers.set("Retry-After", String(retry));
  return res;
}

export function readRateLimitConfig(params: {
  maxEnv: string;
  windowMsEnv: string;
  defaultMax: number;
  defaultWindowMs: number;
}): { max: number; windowMs: number } {
  return {
    max: parsePositiveInt(process.env[params.maxEnv], params.defaultMax),
    windowMs: parseWindowMs(process.env[params.windowMsEnv], params.defaultWindowMs),
  };
}

