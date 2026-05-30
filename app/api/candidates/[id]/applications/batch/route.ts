import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { batchCreateApplicationsFromRequest } from "@/src/lib/batch-applications";
import { checkApplicationMutationRateLimit } from "@/src/lib/rate-limit";
import { canCreateCandidate } from "@/src/lib/rbac";
import {
  buildSelectedRecommendationJobs,
  logRecommendationAccepted,
  parseRecommendationActivityJobRefs,
} from "@/src/lib/recommendation-activity-log";

type RouteContext = { params: Promise<{ id: string }> };

export type BatchApplicationsResponseBody = {
  created: number;
  skippedDuplicates: number;
};

/**
 * POST /api/candidates/[id]/applications/batch
 *
 * Multi-role apply: create one Application per selected job for this candidate.
 * Body: `{ "jobIds": ["...", "..."], "recommendedJobs"?: [{ jobId, title?, matchScore? }] }`
 *
 * Response: `{ created, skippedDuplicates }`
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canCreateCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const rateLimitRes = checkApplicationMutationRateLimit(session.user?.id);
  if (rateLimitRes) return rateLimitRes;

  const { id } = await context.params;
  const candidateId = typeof id === "string" ? id.trim() : "";

  const body = await request.json().catch(() => ({}));
  const payload = body as { jobIds?: unknown; recommendedJobs?: unknown };
  const jobIds = payload?.jobIds;
  const recommendedJobs = parseRecommendationActivityJobRefs(payload?.recommendedJobs);

  const result = await batchCreateApplicationsFromRequest({
    session,
    role: session.user?.role,
    userId: typeof session.user?.id === "string" ? session.user.id : undefined,
    candidateId,
    jobIds,
  });

  if (result instanceof NextResponse) {
    return result;
  }

  const selectedJobIds = Array.isArray(jobIds)
    ? jobIds.filter((id): id is string => typeof id === "string")
    : [];

  try {
    await logRecommendationAccepted({
      candidateId,
      userId: typeof session.user?.id === "string" ? session.user.id : undefined,
      recommendedJobs,
      selectedJobs: buildSelectedRecommendationJobs(selectedJobIds, recommendedJobs),
    });
  } catch {
    // Batch apply outcome is authoritative; audit failure must not roll back creates.
  }

  const responseBody: BatchApplicationsResponseBody = {
    created: result.created,
    skippedDuplicates: result.skippedDuplicates,
  };

  return NextResponse.json(responseBody, {
    status: result.created > 0 ? 201 : 200,
  });
}
