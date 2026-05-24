import { getDashboardCache, setDashboardCache } from "@/src/lib/dashboard-cache";

/** Reports cache TTL (90s): balances freshness and query reduction. */
export const REPORTS_CACHE_TTL_MS = 90_000;

function normalizeToken(value: string | null | undefined): string {
  if (value == null) return "all";
  const v = value.trim();
  return v === "" ? "all" : encodeURIComponent(v);
}

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
  return [
    "reports",
    normalizeToken(params.endpoint),
    `role:${normalizeToken(params.role)}`,
    `user:${normalizeToken(params.userId)}`,
    `range:${normalizeToken(params.range)}`,
    `job:${normalizeToken(params.jobId)}`,
    `dept:${normalizeToken(params.department)}`,
    `type:${normalizeToken(params.type)}`,
    `format:${normalizeToken(params.format)}`,
  ].join(":");
}

export async function getReportsCache<T>(key: string): Promise<T | null> {
  const { value } = await getDashboardCache<T>(key);
  return value;
}

export async function setReportsCache<T>(key: string, value: T): Promise<void> {
  await setDashboardCache(key, value, REPORTS_CACHE_TTL_MS);
}

