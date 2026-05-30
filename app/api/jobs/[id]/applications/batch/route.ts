import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { batchCreateApplicationsForJobFromRequest } from "@/src/lib/batch-applications";
import { checkApplicationMutationRateLimit } from "@/src/lib/rate-limit";
import { canCreateCandidate } from "@/src/lib/rbac";
import { logCandidatesShortlisted } from "@/src/lib/candidate-recommendation-activity-log";
import { logRecruiterAiSearchShortlisted } from "@/src/lib/recruiter-search-activity-log";
import { isValidCuid } from "@/src/lib/validate-id";

type RouteContext = { params: Promise<{ id: string }> };

export type JobBatchApplicationsResponseBody = {
  created: number;
  skippedDuplicates: number;
  skippedNotEligible: number;
  skippedInaccessible: number;
  skippedOther: number;
  results: Array<{
    candidateId: string;
    status: string;
    reason?: string;
    applicationId?: string;
    canonicalCandidateId?: string;
  }>;
};

/**
 * POST /api/jobs/[id]/applications/batch
 *
 * Bulk shortlist: create one Application per selected candidate for this job.
 * Body: `{ "candidateIds": ["...", "..."], "recommendedCandidates"?: [{ candidateId, ... }] }`
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
  const jobId = typeof id === "string" ? id.trim() : "";
  if (!jobId || !isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed job id", 400);
  }

  const body = await request.json().catch(() => ({}));
  const payload = body as {
    candidateIds?: unknown;
    recommendedCandidates?: unknown;
    recruiterSearchId?: unknown;
  };
  const candidateIds = payload?.candidateIds;
  const recommendedCandidatesRaw = payload?.recommendedCandidates;
  const recruiterSearchId =
    typeof payload.recruiterSearchId === "string" ? payload.recruiterSearchId.trim() : "";

  const fromRecommendations =
    Array.isArray(recommendedCandidatesRaw) && recommendedCandidatesRaw.length > 0;

  const result = await batchCreateApplicationsForJobFromRequest({
    session,
    role: session.user?.role,
    userId: typeof session.user?.id === "string" ? session.user.id : undefined,
    jobId,
    candidateIds,
    fromRecommendations,
  });

  if (result instanceof NextResponse) {
    return result;
  }

  const scoreByCandidate = new Map<string, number>();
  if (Array.isArray(recommendedCandidatesRaw)) {
    for (const item of recommendedCandidatesRaw) {
      if (item == null || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const cid = typeof raw.candidateId === "string" ? raw.candidateId.trim() : "";
      const score =
        typeof raw.finalScore === "number" && Number.isFinite(raw.finalScore)
          ? raw.finalScore
          : undefined;
      if (cid && score != null) scoreByCandidate.set(cid, score);
    }
  }

  const userId = typeof session.user?.id === "string" ? session.user.id : undefined;

  try {
    await logCandidatesShortlisted({
      jobId,
      userId,
      entries: result.createdEntries.map((entry) => {
        const requestedRow = result.results.find(
          (r) =>
            r.canonicalCandidateId === entry.candidateId ||
            r.candidateId === entry.candidateId
        );
        const scoreKey = requestedRow?.candidateId ?? entry.candidateId;
        return {
          candidateId: entry.candidateId,
          applicationId: entry.applicationId,
          recommendationScore:
            scoreByCandidate.get(scoreKey) ??
            scoreByCandidate.get(entry.candidateId) ??
            0,
        };
      }),
    });
  } catch {
    // Batch outcome is authoritative; audit failure must not roll back creates.
  }

  if (recruiterSearchId) {
    for (const entry of result.createdEntries) {
      const requestedRow = result.results.find(
        (r) =>
          r.canonicalCandidateId === entry.candidateId ||
          r.candidateId === entry.candidateId
      );
      const scoreKey = requestedRow?.candidateId ?? entry.candidateId;
      void logRecruiterAiSearchShortlisted({
        searchId: recruiterSearchId,
        jobId,
        candidateId: entry.candidateId,
        applicationId: entry.applicationId,
        finalScore:
          scoreByCandidate.get(scoreKey) ??
          scoreByCandidate.get(entry.candidateId),
        userId,
      });
    }
  }

  const responseBody: JobBatchApplicationsResponseBody = {
    created: result.created,
    skippedDuplicates: result.skippedDuplicates,
    skippedNotEligible: result.skippedNotEligible,
    skippedInaccessible: result.skippedInaccessible,
    skippedOther: result.skippedOther,
    results: result.results.map((r) => ({
      candidateId: r.candidateId,
      status: r.status,
      reason: r.reason,
      applicationId: r.applicationId,
      canonicalCandidateId: r.canonicalCandidateId,
    })),
  };

  return NextResponse.json(responseBody, {
    status: result.created > 0 ? 201 : 200,
  });
}
