import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { getSharedRedisClient } from "@/src/lib/redis-connection";

/** Full recruiter AI search requests per user per sliding window. */
export const DEFAULT_RECRUITER_SEARCH_RATE_MAX = 20;
export const DEFAULT_RECRUITER_SEARCH_RATE_WINDOW_MS = 60_000;

/** Uncached calls to the embedding service per user per sliding window (stricter). */
export const DEFAULT_RECRUITER_SEARCH_EMBED_RATE_MAX = 10;
export const DEFAULT_RECRUITER_SEARCH_EMBED_RATE_WINDOW_MS = 60_000;

export type RecruiterSearchRateLimitKind = "search" | "embed";

export type ConsumeRecruiterSearchRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const REDIS_KEY_PREFIX = "recruitment:recruiter-search:ratelimit:v1:";
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

function configFor(kind: RecruiterSearchRateLimitKind): { max: number; windowMs: number } {
  if (kind === "embed") {
    return {
      max: parsePositiveInt(
        process.env.RECRUITER_SEARCH_EMBED_RATE_MAX,
        DEFAULT_RECRUITER_SEARCH_EMBED_RATE_MAX
      ),
      windowMs: parseWindowMs(
        process.env.RECRUITER_SEARCH_EMBED_RATE_WINDOW_MS,
        DEFAULT_RECRUITER_SEARCH_EMBED_RATE_WINDOW_MS
      ),
    };
  }
  return {
    max: parsePositiveInt(
      process.env.RECRUITER_SEARCH_RATE_MAX,
      DEFAULT_RECRUITER_SEARCH_RATE_MAX
    ),
    windowMs: parseWindowMs(
      process.env.RECRUITER_SEARCH_RATE_WINDOW_MS,
      DEFAULT_RECRUITER_SEARCH_RATE_WINDOW_MS
    ),
  };
}

function bucketKey(kind: RecruiterSearchRateLimitKind, userId: string): string {
  return `${kind}:${userId}`;
}

function redisKey(kind: RecruiterSearchRateLimitKind, userId: string): string {
  return `${REDIS_KEY_PREFIX}${kind}:${userId}`;
}

function consumeInMemory(
  key: string,
  max: number,
  windowMs: number
): ConsumeRecruiterSearchRateLimitResult {
  const now = Date.now();
  const pruned = (memoryBuckets.get(key) ?? [])
    .filter((t) => now - t < windowMs)
    .sort((a, b) => a - b);

  if (pruned.length >= max) {
    const oldest = pruned[0]!;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    memoryBuckets.set(key, pruned);
    return { ok: false, retryAfterSeconds };
  }

  pruned.push(now);
  memoryBuckets.set(key, pruned);
  return { ok: true };
}

async function consumeSlidingWindow(
  kind: RecruiterSearchRateLimitKind,
  userId: string
): Promise<ConsumeRecruiterSearchRateLimitResult> {
  const { max, windowMs } = configFor(kind);
  const memKey = bucketKey(kind, userId);
  const r = getRedisClient();

  if (!r) {
    return consumeInMemory(memKey, max, windowMs);
  }

  const key = redisKey(kind, userId);
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
    return consumeInMemory(memKey, max, windowMs);
  }
}

/**
 * Per-user sliding-window limit before a recruiter AI search executes.
 */
export async function consumeRecruiterSearchRateLimit(
  userId: string
): Promise<ConsumeRecruiterSearchRateLimitResult> {
  return consumeSlidingWindow("search", userId);
}

/**
 * Per-user limit on uncached embedding inference (protects AI `/embed` service).
 */
export async function consumeRecruiterSearchEmbedRateLimit(
  userId: string
): Promise<ConsumeRecruiterSearchRateLimitResult> {
  return consumeSlidingWindow("embed", userId);
}

function rateLimitResponse(retryAfterSeconds: number, message: string): NextResponse {
  const res = apiError("RATE_LIMIT_EXCEEDED", message, 429);
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}

/**
 * Returns 429 when the user exceeds recruiter search limits; otherwise null.
 */
export async function checkRecruiterAiSearchRateLimit(
  userId: string | undefined
): Promise<NextResponse | null> {
  if (typeof userId !== "string" || !userId.trim()) return null;

  const result = await consumeRecruiterSearchRateLimit(userId);
  if (result.ok === false) {
    return rateLimitResponse(
      result.retryAfterSeconds,
      "Too many AI searches. Try again later."
    );
  }
  return null;
}

export function formatRecruiterSearchRateLimits(): string {
  const search = configFor("search");
  const embed = configFor("embed");
  return `recruiter-search: max=${search.max}/${search.windowMs}ms; embed=${embed.max}/${embed.windowMs}ms per user`;
}
