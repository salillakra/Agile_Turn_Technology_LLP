import {
  useQuery,
  useInfiniteQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  fetchDashboardSummary,
  fetchDashboardCharts,
  fetchDashboardActivity,
  type DashboardSummary,
  type DashboardCharts,
  type ActivityFeed,
} from "@/lib/api/dashboard";
import {
  dashboardDateRangeQueryKey,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: (range: DashboardDateRangeValue, compare: boolean) =>
    ["dashboard", "summary", dashboardDateRangeQueryKey(range), compare] as const,
  charts: (range: DashboardDateRangeValue) =>
    ["dashboard", "charts", dashboardDateRangeQueryKey(range)] as const,
  activity: () => ["dashboard", "activity"] as const,
};

export function useDashboardSummary(
  range: DashboardDateRangeValue,
  compare: boolean,
  options?: Partial<UseQueryOptions<DashboardSummary>>
) {
  return useQuery({
    queryKey: dashboardKeys.summary(range, compare),
    queryFn: () => fetchDashboardSummary(range, compare),
    staleTime: 30_000,
    ...options,
  });
}

export function useDashboardCharts(
  range: DashboardDateRangeValue,
  options?: Partial<UseQueryOptions<DashboardCharts>>
) {
  return useQuery({
    queryKey: dashboardKeys.charts(range),
    queryFn: () => fetchDashboardCharts(range),
    staleTime: 30_000,
    ...options,
  });
}

export function useDashboardActivity(initialLimit = 8) {
  return useInfiniteQuery({
    queryKey: dashboardKeys.activity(),
    queryFn: ({ pageParam }) =>
      fetchDashboardActivity(initialLimit, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: ActivityFeed) =>
      lastPage.hasMore ? lastPage.nextCursor : null,
    staleTime: 20_000,
  });
}
