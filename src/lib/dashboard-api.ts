import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import type { Session } from "next-auth";

export async function requireDashboardAuth(): Promise<{ session: Session } | NextResponse> {
  const session = await getSession();
  if (!session) {
    return apiError("UNAUTHORIZED", "Authentication required", 401);
  }

  const role = session.user?.role;
  if (!role || !canViewCandidates(role)) {
    return apiError("FORBIDDEN", "You do not have access to dashboard data", 403);
  }

  return { session };
}

export function dashboardDatabaseError(error: unknown): NextResponse {
  const reason = error instanceof Error ? error.message : "Unknown database error";
  if (process.env.NODE_ENV === "development") {
    console.error("[dashboard] DATABASE_ERROR", error);
  }
  return apiError("DATABASE_ERROR", "Failed to fetch dashboard data", 500, {
    reason,
  });
}

