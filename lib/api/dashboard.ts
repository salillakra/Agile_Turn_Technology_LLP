import apiClient from "@/lib/axios";
import {
  dashboardDateRangeToSearchParams,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";

export interface DashboardSummary {
  openJobs: number;
  totalJobs: number;
  totalApplications: number;
  totalCandidates: number;
  activePipelineCount: number;
  hiredCount: number;
  offerRate: number;
  averageTimeToHire: number;
  totalApplicationsChangePercent?: number;
  activePipelineCountChangePercent?: number;
  hiredCountChangePercent?: number;
  offerRateChangePercent?: number;
  averageTimeToHireChangePercent?: number;
}

export interface DashboardCharts {
  stageDistribution: { stage: string; count: number; applicantsDrillDownHref?: string }[];
  sourceDistribution: { source: string; count: number; applicantsDrillDownHref?: string }[];
  departmentDistribution: { department: string; count: number }[];
  monthlyTrend: { month: string; count: number }[];
}

export interface ActivityItem {
  id: string;
  action: string;
  applicationId?: string;
  createdAt: string;
  user?: { name: string; email: string };
}

export interface ActivityFeed {
  activity: ActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

function buildRangeQueryString(range: DashboardDateRangeValue, compare = false): string {
  const params = dashboardDateRangeToSearchParams(range);
  if (compare) params.set("compare", "true");
  return params.toString();
}

export async function fetchDashboardSummary(
  range: DashboardDateRangeValue,
  compare: boolean
): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>(
    `/dashboard/summary?${buildRangeQueryString(range, compare)}`
  );
  return data;
}

export async function fetchDashboardCharts(range: DashboardDateRangeValue): Promise<DashboardCharts> {
  const { data } = await apiClient.get<DashboardCharts>(
    `/dashboard/charts?${buildRangeQueryString(range)}`
  );
  return data;
}

export async function fetchDashboardActivity(
  limit = 8,
  cursor?: string | null
): Promise<ActivityFeed> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const { data } = await apiClient.get<ActivityFeed>(`/dashboard/activity?${params}`);
  return data;
}

export async function fetchReportsSummary(
  range: DashboardDateRangeValue,
  compare: boolean
): Promise<unknown> {
  const { data } = await apiClient.get(`/reports/overview?${buildRangeQueryString(range, compare)}`);
  return data;
}

export async function fetchReportsCharts(range: DashboardDateRangeValue): Promise<unknown> {
  const { data } = await apiClient.get(`/dashboard/charts?${buildRangeQueryString(range)}`);
  return data;
}

export async function fetchExportAudit(): Promise<unknown[]> {
  const { data } = await apiClient.get("/reports/export-audit");
  return Array.isArray(data?.data) ? data.data : [];
}

export function reportsExportUrl(
  range: DashboardDateRangeValue,
  format: string,
  type = "applications"
): string {
  const params = dashboardDateRangeToSearchParams(range, { type, format });
  return `/api/reports/export?${params.toString()}`;
}
