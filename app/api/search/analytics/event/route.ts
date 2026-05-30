import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { logRecruiterAiSearchResultClicked } from "@/src/lib/recruiter-search-activity-log";
import { canViewCandidates } from "@/src/lib/rbac";
import { isValidCuid } from "@/src/lib/validate-id";

export const runtime = "nodejs";

const CLICK_TYPES = [
  "VIEW_PROFILE",
  "ADD_PIPELINE",
  "SHORTLIST",
  "RESULT_IMPRESSION",
] as const;

type ClickType = (typeof CLICK_TYPES)[number];

/**
 * POST /api/search/analytics/event
 *
 * Record recruiter interaction with an AI search result (click telemetry).
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const searchId = typeof body.searchId === "string" ? body.searchId.trim() : "";
  const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
  const rawType = typeof body.clickType === "string" ? body.clickType.trim() : "";
  const clickType = (CLICK_TYPES as readonly string[]).includes(rawType)
    ? (rawType as ClickType)
    : null;

  if (!searchId) {
    return apiError("INVALID_SEARCH_ID", "searchId is required", 400);
  }
  if (!candidateId || !isValidCuid(candidateId)) {
    return apiError("INVALID_CANDIDATE_ID", "candidateId is required", 400);
  }
  if (!clickType) {
    return apiError(
      "INVALID_CLICK_TYPE",
      `clickType must be one of: ${CLICK_TYPES.join(", ")}`,
      400
    );
  }

  const finalScore =
    typeof body.finalScore === "number" && Number.isFinite(body.finalScore)
      ? body.finalScore
      : undefined;
  const semanticScore =
    typeof body.semanticScore === "number" && Number.isFinite(body.semanticScore)
      ? body.semanticScore
      : undefined;
  const rankPosition =
    typeof body.rankPosition === "number" && Number.isFinite(body.rankPosition)
      ? Math.trunc(body.rankPosition)
      : undefined;

  await logRecruiterAiSearchResultClicked({
    searchId,
    candidateId,
    clickType,
    userId,
    finalScore,
    semanticScore,
    rankPosition,
  });

  return NextResponse.json({ ok: true });
}
