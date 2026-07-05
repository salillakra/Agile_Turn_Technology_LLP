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

export type DashboardRange = "7d" | "30d" | "90d" | "all" | "custom";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function parseDashboardRange(value: string | null | undefined): DashboardRange | null {
  const normalized = (value ?? "all").trim();
  if (
    normalized === "7d" ||
    normalized === "30d" ||
    normalized === "90d" ||
    normalized === "all" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  return null;
}

function parseIsoDateParam(value: string | null | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

export type ParsedDashboardRangeParams = {
  range: DashboardRange;
  dateFrom?: Date;
  dateTo?: Date;
};

export function parseDashboardRangeParams(
  searchParams: URLSearchParams
): ParsedDashboardRangeParams | null {
  const range = parseDashboardRange(searchParams.get("range"));
  if (!range) return null;

  const dateFrom = parseIsoDateParam(searchParams.get("dateFrom"));
  const dateTo = parseIsoDateParam(searchParams.get("dateTo"));

  if (range === "custom" && !dateFrom) {
    return null;
  }

  return { range, dateFrom, dateTo };
}

/** Stable cache/query token for preset or custom ranges. */
export function dashboardRangeCacheToken(params: ParsedDashboardRangeParams): string {
  if (params.range === "custom" && params.dateFrom) {
    const from = params.dateFrom.toISOString().slice(0, 10);
    const to = (params.dateTo ?? params.dateFrom).toISOString().slice(0, 10);
    return `custom:${from}:${to}`;
  }
  return params.range;
}

export function getDateFilterOptions(params: ParsedDashboardRangeParams): DateFilterOptions {
  return { dateFrom: params.dateFrom, dateTo: params.dateTo };
}

export function isBoundedDashboardRange(
  params: Pick<ParsedDashboardRangeParams, "range">
): boolean {
  return params.range !== "all";
}

type DateFilterOptions = {
  dateFrom?: Date;
  dateTo?: Date;
};

/**
 * Lower bound for `application.appliedDate` range filters. Uses an absolute instant (`Date`) so Prisma compares
 * consistently with DB timestamps regardless of server OS timezone.
 */
export function getApplicationsAppliedDateFilter(
  range: DashboardRange,
  options: DateFilterOptions = {}
): { gte?: Date; lte?: Date } | undefined {
  if (range === "all") return undefined;

  if (range === "custom" && options.dateFrom) {
    const filter: { gte: Date; lte?: Date } = { gte: options.dateFrom };
    if (options.dateTo) filter.lte = endOfUtcDay(options.dateTo);
    return filter;
  }

  if (range === "custom") return undefined;

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { gte: new Date(Date.now() - days * DAY_IN_MS) };
}

/**
 * Previous period of equal length immediately before the current window (UTC instants).
 */
export function getPreviousApplicationsAppliedDateFilter(
  range: DashboardRange,
  options: DateFilterOptions = {}
): { gte: Date; lt: Date } | null {
  if (range === "all") return null;

  if (range === "custom" && options.dateFrom && options.dateTo) {
    const startMs = options.dateFrom.getTime();
    const endMs = endOfUtcDay(options.dateTo).getTime();
    const windowMs = endMs - startMs + 1;
    const lt = new Date(startMs);
    const gte = new Date(startMs - windowMs);
    return { gte, lt };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const now = Date.now();
  const windowMs = days * DAY_IN_MS;
  const lt = new Date(now - windowMs);
  const gte = new Date(now - 2 * windowMs);
  return { gte, lt };
}

// Backwards-compatible aliases (older code referred to `createdAt` windows, but the product UX
// and Applicants list are driven by `appliedDate`).
export const getApplicationsCreatedAtFilter = getApplicationsAppliedDateFilter;
export const getPreviousApplicationsCreatedAtFilter = getPreviousApplicationsAppliedDateFilter;

/**
 * UTC calendar month bucket for grouping (e.g. monthly trend charts).
 * Boundaries: month N includes instants t where UTC year/month equals N (no local-timezone shift).
 */
export function toUtcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
