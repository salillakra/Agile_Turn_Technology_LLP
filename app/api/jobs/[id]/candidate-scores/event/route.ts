import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { logAiCandidateScoreInteraction, logAiCandidateScoreShortlisted } from "@/src/lib/ai-candidate-score-activity-log";

export const runtime = "nodejs";

const INTERACTIONS = [
  "RESULT_IMPRESSION",
  "VIEW_PROFILE",
  "ADD_PIPELINE",
  "SHORTLIST",
  "IGNORED",
  "REJECTED",
] as const;

type InteractionType = (typeof INTERACTIONS)[number];

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/jobs/[id]/candidate-scores/event
 *
 * Track recruiter interactions with AI candidate score results (for future ranking optimization).
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  const jobId = typeof id === "string" ? id.trim() : "";
  if (!jobId || !isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed job id", 400);
  }

  if (!(await canAccessJobByScope(role, userId, jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
  const rawType = typeof body.interactionType === "string" ? body.interactionType.trim() : "";
  const interactionType = (INTERACTIONS as readonly string[]).includes(rawType)
    ? (rawType as InteractionType)
    : null;

  if (!candidateId || !isValidCuid(candidateId)) {
    return apiError("INVALID_CANDIDATE_ID", "candidateId is required", 400);
  }
  if (!interactionType) {
    return apiError(
      "INVALID_INTERACTION_TYPE",
      `interactionType must be one of: ${INTERACTIONS.join(", ")}`,
      400
    );
  }

  const candidateFitScore =
    typeof body.candidateFitScore === "number" && Number.isFinite(body.candidateFitScore)
      ? body.candidateFitScore
      : undefined;
  const semanticScore =
    typeof body.semanticScore === "number" && Number.isFinite(body.semanticScore)
      ? body.semanticScore
      : undefined;
  const rankPosition =
    typeof body.rankPosition === "number" && Number.isFinite(body.rankPosition)
      ? Math.trunc(body.rankPosition)
      : undefined;
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;

  await logAiCandidateScoreInteraction({
    jobId,
    candidateId,
    userId,
    interactionType,
    candidateFitScore,
    semanticScore,
    rankPosition,
    reason,
  });

  if (interactionType === "SHORTLIST") {
    await logAiCandidateScoreShortlisted({
      jobId,
      candidateId,
      userId,
      candidateFitScore: candidateFitScore ?? 0,
    });
  }

  return NextResponse.json({ ok: true });
}

