import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { getRecruiterSearchAnalytics } from "@/src/lib/recruiter-search-analytics";
import { isAdmin, canViewCandidates } from "@/src/lib/rbac";

export const runtime = "nodejs";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/**
 * GET /api/search/analytics?days=30
 *
 * Recruiter AI search metrics: skills, success rate, clicks, shortlist conversion.
 * Non-admin users receive analytics for their own searches only.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { searchParams } = new URL(request.url);
  const daysRaw = searchParams.get("days");
  const daysNum = daysRaw != null ? Number(daysRaw) : DEFAULT_DAYS;
  const days = Number.isFinite(daysNum)
    ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(daysNum)))
    : DEFAULT_DAYS;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  try {
    const summary = await getRecruiterSearchAnalytics({
      since,
      userId: isAdmin(role) ? undefined : userId,
    });

    return NextResponse.json({
      ...summary,
      periodDays: days,
      scope: isAdmin(role) ? "organization" : "user",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analytics failed";
    return apiError(
      "ANALYTICS_FAILED",
      process.env.NODE_ENV === "development" ? message : "Failed to load search analytics",
      500
    );
  }
}
