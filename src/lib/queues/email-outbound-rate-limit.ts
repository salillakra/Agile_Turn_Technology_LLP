import { RateLimitError } from "bullmq";
import { getSharedRedisClient } from "@/src/lib/redis-connection";

/**
 * Outbound SMTP send caps (worker-side, before `sendTransactionalEmail`).
 * Complements BullMQ `limiter` on `createEmailWorker` — together they reduce
 * provider throttling, burst spam, and reputation damage.
 */

/** Max successful send attempts started globally per window (all worker processes). */
export const DEFAULT_EMAIL_OUTBOUND_GLOBAL_MAX = 25;
export const DEFAULT_EMAIL_OUTBOUND_GLOBAL_WINDOW_MS = 60_000;

/** Max send attempts per recipient inbox per window (anti-spam / harassment guard). */
export const DEFAULT_EMAIL_OUTBOUND_RECIPIENT_MAX = 5;
export const DEFAULT_EMAIL_OUTBOUND_RECIPIENT_WINDOW_MS = 3_600_000;

const REDIS_KEY_GLOBAL = "recruitment:email:outbound:global:v1";
const REDIS_KEY_RECIPIENT_PREFIX = "recruitment:email:outbound:recipient:v1:";

type MemoryBucket = { timestamps: number[] };

const memoryGlobal: MemoryBucket = { timestamps: [] };
const memoryByRecipient = new Map<string, number[]>();

export type OutboundEmailRateLimitScope = "global" | "recipient";

export type ConsumeOutboundEmailRateLimitResult =
  | { ok: true }
  | { ok: false; scope: OutboundEmailRateLimitScope; retryAfterSeconds: number };

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

function globalConfig(): { max: number; windowMs: number } {
  return {
    max: parsePositiveInt(
      process.env.EMAIL_OUTBOUND_GLOBAL_MAX,
      DEFAULT_EMAIL_OUTBOUND_GLOBAL_MAX
    ),
    windowMs: parseWindowMs(
      process.env.EMAIL_OUTBOUND_GLOBAL_WINDOW_MS,
      DEFAULT_EMAIL_OUTBOUND_GLOBAL_WINDOW_MS
    ),
  };
}

function recipientConfig(): { max: number; windowMs: number } {
  return {
    max: parsePositiveInt(
      process.env.EMAIL_OUTBOUND_RECIPIENT_MAX,
      DEFAULT_EMAIL_OUTBOUND_RECIPIENT_MAX
    ),
    windowMs: parseWindowMs(
      process.env.EMAIL_OUTBOUND_RECIPIENT_WINDOW_MS,
      DEFAULT_EMAIL_OUTBOUND_RECIPIENT_WINDOW_MS
    ),
  };
}

function normalizeRecipient(email: string): string {
  return email.trim().toLowerCase();
}

function consumeInMemory(
  scope: OutboundEmailRateLimitScope,
  bucketKey: string,
  max: number,
  windowMs: number,
  store: Map<string, number[]> | MemoryBucket
): ConsumeOutboundEmailRateLimitResult {
  const now = Date.now();
  const list =
    store instanceof Map
      ? store.get(bucketKey) ?? []
      : store.timestamps;
  const pruned = list.filter((t) => now - t < windowMs).sort((a, b) => a - b);

  if (pruned.length >= max) {
    const oldest = pruned[0]!;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(Math.max(0, windowMs - (now - oldest)) / 1000)
    );
    if (store instanceof Map) {
      store.set(bucketKey, pruned);
    } else {
      store.timestamps = pruned;
    }
    return { ok: false, scope, retryAfterSeconds };
  }

  pruned.push(now);
  if (store instanceof Map) {
    store.set(bucketKey, pruned);
  } else {
    store.timestamps = pruned;
  }
  return { ok: true };
}

async function consumeRedisSlidingWindow(
  redisKey: string,
  scope: OutboundEmailRateLimitScope,
  max: number,
  windowMs: number
): Promise<ConsumeOutboundEmailRateLimitResult | null> {
  const r = getSharedRedisClient("cache");
  if (!r) return null;

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
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(Math.max(0, windowMs - (now - oldestScore)) / 1000)
      );
      return { ok: false, scope, retryAfterSeconds };
    }
    await r.zadd(redisKey, now, member);
    await r.pexpire(redisKey, windowMs);
    return { ok: true };
  } catch {
    return null;
  }
}

async function consumeScope(
  scope: OutboundEmailRateLimitScope,
  redisKey: string,
  memoryKey: string,
  max: number,
  windowMs: number
): Promise<ConsumeOutboundEmailRateLimitResult> {
  const redisResult = await consumeRedisSlidingWindow(
    redisKey,
    scope,
    max,
    windowMs
  );
  if (redisResult) {
    return redisResult;
  }

  const store = scope === "global" ? memoryGlobal : memoryByRecipient;
  return consumeInMemory(scope, memoryKey, max, windowMs, store);
}

/**
 * Reserve an outbound send slot (call immediately before SMTP). Fails closed in-memory when Redis is down.
 */
export async function consumeOutboundEmailSendRateLimit(
  recipient: string
): Promise<ConsumeOutboundEmailRateLimitResult> {
  const global = globalConfig();
  const globalResult = await consumeScope(
    "global",
    REDIS_KEY_GLOBAL,
    "global",
    global.max,
    global.windowMs
  );
  if (!globalResult.ok) return globalResult;

  const recipientNorm = normalizeRecipient(recipient);
  const recip = recipientConfig();
  return consumeScope(
    "recipient",
    `${REDIS_KEY_RECIPIENT_PREFIX}${recipientNorm}`,
    recipientNorm,
    recip.max,
    recip.windowMs
  );
}

/**
 * Throws BullMQ {@link RateLimitError} so the job returns to wait (not FAILED / retry budget).
 */
export async function assertOutboundEmailSendRateLimit(
  recipient: string
): Promise<void> {
  const result = await consumeOutboundEmailSendRateLimit(recipient);
  if (!result.ok) {
    const errResult = result as { ok: false; scope: OutboundEmailRateLimitScope; retryAfterSeconds: number };
    throw new RateLimitError(
      `outbound email rate limited (${errResult.scope}); retry after ${errResult.retryAfterSeconds}s`
    );
  }
}

export function formatOutboundEmailRateLimits(): string {
  const g = globalConfig();
  const r = recipientConfig();
  const perMin = (g.max / (g.windowMs / 1000)).toFixed(2);
  return `outbound-global: max=${g.max}/${g.windowMs}ms (~${perMin}/s); per-recipient: max=${r.max}/${r.windowMs}ms`;
}
