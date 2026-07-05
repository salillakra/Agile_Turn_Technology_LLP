import { endOfDay, format, startOfDay, subDays } from "date-fns";

export type DashboardDateRangePreset = "7d" | "30d" | "90d" | "all" | "custom";

export type DashboardDateRangeValue = {
  preset: DashboardDateRangePreset;
  from?: Date;
  to?: Date;
};

export const PRESET_LABELS: Record<Exclude<DashboardDateRangePreset, "custom">, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export function defaultDashboardDateRange(): DashboardDateRangeValue {
  return presetToRange("30d");
}

export function presetToRange(preset: "7d" | "30d" | "90d"): DashboardDateRangeValue {
  const to = endOfDay(new Date());
  const offsetDays = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
  return {
    preset,
    from: startOfDay(subDays(to, offsetDays)),
    to,
  };
}

export function dashboardDateRangeToQuery(value: DashboardDateRangeValue): {
  range: string;
  dateFrom?: string;
  dateTo?: string;
} {
  if (value.preset === "all") return { range: "all" };
  if (value.preset !== "custom") return { range: value.preset };
  if (!value.from) return { range: "30d" };
  return {
    range: "custom",
    dateFrom: format(value.from, "yyyy-MM-dd"),
    dateTo: format(value.to ?? value.from, "yyyy-MM-dd"),
  };
}

export function dashboardDateRangeToSearchParams(
  value: DashboardDateRangeValue,
  extra?: Record<string, string>
): URLSearchParams {
  const q = dashboardDateRangeToQuery(value);
  const params = new URLSearchParams(extra);
  params.set("range", q.range);
  if (q.dateFrom) params.set("dateFrom", q.dateFrom);
  if (q.dateTo) params.set("dateTo", q.dateTo);
  return params;
}

export function dashboardDateRangeQueryKey(value: DashboardDateRangeValue): string {
  const q = dashboardDateRangeToQuery(value);
  if (q.dateFrom && q.dateTo) return `${q.range}:${q.dateFrom}:${q.dateTo}`;
  return q.range;
}

export function formatDashboardDateRangeLabel(value: DashboardDateRangeValue): string {
  if (value.preset === "all") return PRESET_LABELS.all;
  if (value.preset !== "custom") return PRESET_LABELS[value.preset];
  if (value.from && value.to) {
    return `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`;
  }
  if (value.from) return format(value.from, "MMM d, yyyy");
  return "Pick a date range";
}

export function isDashboardCompareAvailable(value: DashboardDateRangeValue): boolean {
  return value.preset !== "all";
}
