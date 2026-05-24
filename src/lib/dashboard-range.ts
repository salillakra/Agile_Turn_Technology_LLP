/**
 * Dashboard metrics — timezone policy
 *
 * 1. Database `DateTime` values are treated as UTC instants end-to-end (write paths should use `new Date()` /
 *    server UTC; persist without applying a business-timezone offset on the server for analytics APIs).
 * 2. Dashboard API handlers do not convert to a business timezone; JSON responses use ISO-8601 (UTC `Z`) for dates.
 * 3. Any calendar grouping on the server (e.g. monthly buckets) MUST use UTC boundaries via helpers below
 *    (`getUTC*`), never local `getMonth` / `getFullYear`.
 *
 * Business-time display (e.g. "America/New_York") belongs in the frontend only.
 */
export const DASHBOARD_METRICS_STORAGE_AND_AGGREGATION_TZ = "UTC" as const;

export type DashboardRange = "7d" | "30d" | "90d" | "all";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function parseDashboardRange(value: string | null | undefined): DashboardRange | null {
  const normalized = (value ?? "all").trim();
  if (normalized === "7d" || normalized === "30d" || normalized === "90d" || normalized === "all") {
    return normalized;
  }
  return null;
}

/**
 * Lower bound for `application.createdAt` range filters. Uses an absolute instant (`Date`) so Prisma compares
 * consistently with DB timestamps regardless of server OS timezone.
 */
export function getApplicationsCreatedAtFilter(range: DashboardRange): { gte: Date } | undefined {
  if (range === "all") return undefined;

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { gte: new Date(Date.now() - days * DAY_IN_MS) };
}

/**
 * Previous period of equal length immediately before the current `range` window (UTC instants).
 * Example (7d): [now−14d, now−7d) for `createdAt`, matching current [now−7d, now).
 */
export function getPreviousApplicationsCreatedAtFilter(
  range: DashboardRange
): { gte: Date; lt: Date } | null {
  if (range === "all") return null;

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const now = Date.now();
  const windowMs = days * DAY_IN_MS;
  const lt = new Date(now - windowMs);
  const gte = new Date(now - 2 * windowMs);
  return { gte, lt };
}

/**
 * UTC calendar month bucket for grouping (e.g. monthly trend charts).
 * Boundaries: month N includes instants t where UTC year/month equals N (no local-timezone shift).
 */
export function toUtcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

