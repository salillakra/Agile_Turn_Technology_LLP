import {
  dashboardChartsCacheLogicalKey,
  dashboardSummaryCacheLogicalKey,
} from "@/src/lib/cache/cache-keys";
import { readPositiveIntEnv } from "@/src/lib/cache/cache-utils";
import {
  DASHBOARD_CACHE_TTL_MS,
  getDashboardCache,
  setDashboardCache,
  type DashboardCacheRead,
} from "@/src/lib/dashboard-cache";

/** Default 10 minutes — within recommended 5–15 minute analytics window. */
export const DEFAULT_DASHBOARD_ANALYTICS_CACHE_TTL_SEC = 600;

const MIN_DASHBOARD_ANALYTICS_CACHE_TTL_SEC = 300;
const MAX_DASHBOARD_ANALYTICS_CACHE_TTL_SEC = 900;

/**
 * TTL for dashboard summary, charts, and pipeline stats (env override).
 * Clamped to 5–15 minutes: `DASHBOARD_ANALYTICS_CACHE_TTL_SEC`.
 */
export function getDashboardAnalyticsCacheTtlMs(): number {
  const raw = readPositiveIntEnv(
    "DASHBOARD_ANALYTICS_CACHE_TTL_SEC",
    DEFAULT_DASHBOARD_ANALYTICS_CACHE_TTL_SEC
  );
  const clamped = Math.min(
    MAX_DASHBOARD_ANALYTICS_CACHE_TTL_SEC,
    Math.max(MIN_DASHBOARD_ANALYTICS_CACHE_TTL_SEC, raw)
  );
  return clamped * 1000;
}

export { dashboardSummaryCacheLogicalKey, dashboardChartsCacheLogicalKey };

export async function getDashboardAnalyticsCache<T>(
  logicalKey: string
): Promise<DashboardCacheRead<T>> {
  return getDashboardCache<T>(logicalKey);
}

export async function setDashboardAnalyticsCache<T>(
  logicalKey: string,
  value: T
): Promise<void> {
  // SWR: keep cache entries around longer than the freshness window.
  // Freshness is `DASHBOARD_ANALYTICS_CACHE_TTL_SEC` (5–15 min); stale window is 2×.
  await setDashboardCache(logicalKey, value, getDashboardAnalyticsCacheTtlMs() * 2);
}

/** @deprecated Use `getDashboardAnalyticsCacheTtlMs` — was 60s. */
export const LEGACY_DASHBOARD_CACHE_TTL_MS = DASHBOARD_CACHE_TTL_MS;
