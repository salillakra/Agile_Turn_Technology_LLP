import { NextResponse } from "next/server";
import { apiError } from "./api-error-response";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 50;
const MAX_ACTIVITY_LOG_REQUESTS_PER_WINDOW = 30;
const MAX_NOTIFICATION_API_REQUESTS_PER_WINDOW = 60;

const store = new Map<string, { count: number; windowEnd: number }>();

function getWindowKey(): number {
  return Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
}

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.windowEnd <= now) store.delete(key);
  }
}

/**
 * In-memory per-user rate limit. 50 requests per minute per user.
 * Returns NextResponse (429) when exceeded; otherwise null (allowed).
 * Call after auth; pass session.user.id. Skips check if userId is missing.
 */
export function checkApplicationMutationRateLimit(
  userId: string | undefined
): NextResponse | null {
  if (typeof userId !== "string") return null;

  const windowStart = getWindowKey();
  const key = `${userId}:${windowStart}`;
  const entry = store.get(key);

  if (entry) {
    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.ceil((entry.windowEnd - Date.now()) / 1000);
      const res = apiError("RATE_LIMIT_EXCEEDED", "Too many requests. Try again later.", 429);
      res.headers.set("Retry-After", String(Math.max(1, retryAfter)));
      return res;
    }
    entry.count += 1;
  } else {
    if (store.size > 100_000) prune();
    store.set(key, { count: 1, windowEnd: windowStart + WINDOW_MS });
  }

  return null;
}

/**
 * In-memory per-user rate limit for notification APIs (GET list, unread-count, PATCH read, PATCH read-all).
 * 60 requests per minute per user, shared across all notification endpoints.
 */
export function checkNotificationApiRateLimit(
  userId: string | undefined
): NextResponse | null {
  if (typeof userId !== "string") return null;

  const windowStart = getWindowKey();
  const key = `notifications:${userId}:${windowStart}`;
  const entry = store.get(key);

  if (entry) {
    if (entry.count >= MAX_NOTIFICATION_API_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.ceil((entry.windowEnd - Date.now()) / 1000);
      const res = apiError("RATE_LIMIT_EXCEEDED", "Too many requests. Try again later.", 429);
      res.headers.set("Retry-After", String(Math.max(1, retryAfter)));
      return res;
    }
    entry.count += 1;
  } else {
    if (store.size > 100_000) prune();
    store.set(key, { count: 1, windowEnd: windowStart + WINDOW_MS });
  }

  return null;
}

/**
 * In-memory per-user rate limit for admin/global activity feeds.
 * Limits GET /api/activity-logs to 30 requests per minute per user.
 */
export function checkGlobalActivityLogsRateLimit(
  userId: string | undefined
): NextResponse | null {
  if (typeof userId !== "string") return null;

  const windowStart = getWindowKey();
  const key = `activity-logs:${userId}:${windowStart}`;
  const entry = store.get(key);

  if (entry) {
    if (entry.count >= MAX_ACTIVITY_LOG_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.ceil((entry.windowEnd - Date.now()) / 1000);
      const res = apiError("RATE_LIMIT_EXCEEDED", "Too many requests. Try again later.", 429);
      res.headers.set("Retry-After", String(Math.max(1, retryAfter)));
      return res;
    }
    entry.count += 1;
  } else {
    if (store.size > 100_000) prune();
    store.set(key, { count: 1, windowEnd: windowStart + WINDOW_MS });
  }

  return null;
}
