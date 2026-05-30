import { reportsCacheLogicalKey } from "@/src/lib/cache/cache-keys";
import { getDashboardCache, setDashboardCache } from "@/src/lib/dashboard-cache";

/** Reports cache TTL (90s): balances freshness and query reduction. */
export const REPORTS_CACHE_TTL_MS = 90_000;

export function buildReportsCacheKey(params: {
  endpoint: string;
  role: string | undefined;
  userId: string | undefined;
  range?: string | null;
  jobId?: string | null;
  department?: string | null;
  type?: string | null;
  format?: string | null;
}): string {
  return reportsCacheLogicalKey(params);
}

export async function getReportsCache<T>(key: string): Promise<T | null> {
  const { value } = await getDashboardCache<T>(key);
  return value;
}

export async function setReportsCache<T>(key: string, value: T): Promise<void> {
  // SWR: keep reports cache entries around longer than freshness window.
  await setDashboardCache(key, value, REPORTS_CACHE_TTL_MS * 2);
}
