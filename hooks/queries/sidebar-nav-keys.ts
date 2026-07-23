/** Centralized React Query store keys for dashboard sidebar badges/stats. */
export const sidebarNavKeys = {
  all: ["sidebar-nav"] as const,
  counts: () => ["sidebar-nav", "counts"] as const,
};
