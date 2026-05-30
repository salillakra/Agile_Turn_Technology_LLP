import { isRedisConfigured } from "@/src/lib/queues/redis";
import { getBullMqRedisConnection } from "@/src/lib/redis-connection";
import {
  enqueueAnalyticsRefresh,
  type AnalyticsRefreshScope,
} from "@/src/lib/queues/analytics-queue";

/**
 * Fire-and-forget LOW-priority analytics warm job (no-op when Redis is unset).
 */
export function scheduleAnalyticsCacheRefresh(params: {
  scope: AnalyticsRefreshScope;
  cacheKey: string;
  userId?: string;
  role?: string;
}): void {
  if (!isRedisConfigured()) return;
  // If Redis is configured but currently unavailable (shared connection disabled),
  // skip background refresh rather than spamming logs.
  if (!getBullMqRedisConnection()) return;

  void enqueueAnalyticsRefresh({
    scope: params.scope,
    cacheKey: params.cacheKey,
    userId: params.userId,
    role: params.role,
  }).catch((err) => {
    console.error("[analytics] enqueue refresh failed:", err);
  });
}
