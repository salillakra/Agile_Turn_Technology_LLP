import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { isAdmin } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { readCacheAnalytics } from "@/src/lib/cache/cache-analytics";

export const runtime = "nodejs";

/** GET /api/cache/analytics — cache analytics snapshot (ADMIN only). */
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  if (!isAdmin(role)) {
    return apiError("FORBIDDEN", "Admin only", 403);
  }

  const { searchParams } = new URL(request.url);
  const topN = Math.max(1, Math.min(50, Number(searchParams.get("topN") ?? "10") || 10));

  const data = await readCacheAnalytics({ topN });
  return NextResponse.json(data);
}

