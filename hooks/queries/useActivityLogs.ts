import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { fetchActivityLogs, type ActivityLogFeed } from "@/lib/api/activity-logs";

export const activityLogKeys = {
  all: ["activity-logs"] as const,
  feed: (limit: number) => ["activity-logs", "feed", limit] as const,
};

export function useActivityLogs(pageSize = 25) {
  return useInfiniteQuery({
    queryKey: activityLogKeys.feed(pageSize),
    queryFn: ({ pageParam }) => fetchActivityLogs(pageSize, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: ActivityLogFeed) =>
      lastPage.hasMore ? lastPage.nextCursor : null,
    staleTime: 20_000,
  });
}

export function useInvalidateActivityLogs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: activityLogKeys.all });
}
