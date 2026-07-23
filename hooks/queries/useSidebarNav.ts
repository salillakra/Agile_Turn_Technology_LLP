import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  fetchSidebarNavCounts,
  type DashboardSidebarNavCounts,
} from "@/lib/api/sidebar-nav";
import { sidebarNavKeys } from "@/hooks/queries/sidebar-nav-keys";

export { sidebarNavKeys };

export function invalidateSidebarNav(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: sidebarNavKeys.all });
}

export function useSidebarNavCounts(initialData?: DashboardSidebarNavCounts) {
  return useQuery({
    queryKey: sidebarNavKeys.counts(),
    queryFn: fetchSidebarNavCounts,
    initialData,
    staleTime: 15_000,
  });
}

/** Hook helper for mutations that change jobs/applications counts. */
export function useInvalidateSidebarNav() {
  const queryClient = useQueryClient();
  return () => invalidateSidebarNav(queryClient);
}
