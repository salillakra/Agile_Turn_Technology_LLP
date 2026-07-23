import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { getDashboardSidebarNavCounts } from "@/src/lib/dashboard-sidebar-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/sidebar-nav — live Jobs / Applicants / Hired / Active counts
 * for the dashboard sidebar (same scope rules as the server layout).
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const nav = await getDashboardSidebarNavCounts({
    role: auth.session.user?.role,
    userId: auth.session.user?.id,
  });
  return NextResponse.json(nav);
}
