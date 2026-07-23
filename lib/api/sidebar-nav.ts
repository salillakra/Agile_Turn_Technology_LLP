import type { DashboardSidebarNavCounts } from "@/src/lib/dashboard-sidebar-nav";

export type { DashboardSidebarNavCounts };

export async function fetchSidebarNavCounts(): Promise<DashboardSidebarNavCounts> {
  const res = await fetch("/api/dashboard/sidebar-nav", {
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      body?.message || body?.error || `Sidebar counts failed (${res.status})`
    );
  }
  return {
    jobsCount: Number(body.jobsCount) || 0,
    applicantsCount: Number(body.applicantsCount) || 0,
    hiredCount: Number(body.hiredCount) || 0,
    activeCount: Number(body.activeCount) || 0,
  };
}
