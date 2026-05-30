import {
  ACTIVITY_ACTION_CANDIDATE_RECOMMENDED,
  ACTIVITY_ACTION_CANDIDATE_SHORTLISTED,
  buildCandidateRecommendationActivityDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

const MAX_RECOMMENDATION_LOG_ROWS = 50;

export type CandidateRecommendationLogRef = {
  candidateId: string;
  recommendationScore: number;
};

function normalizeScore(score: number): number | null {
  return Number.isFinite(score) ? Math.round(score * 10) / 10 : null;
}

async function persistCandidateRecommendationLog(params: {
  action:
    | typeof ACTIVITY_ACTION_CANDIDATE_RECOMMENDED
    | typeof ACTIVITY_ACTION_CANDIDATE_SHORTLISTED;
  jobId: string;
  candidateId: string;
  recommendationScore: number;
  userId: string | undefined;
  applicationId?: string;
}): Promise<void> {
  const score = normalizeScore(params.recommendationScore);
  if (score == null) return;

  const detailsObj = buildCandidateRecommendationActivityDetails(
    params.jobId,
    params.candidateId,
    score,
    params.applicationId
  );

  const serialized = serializeActivityLogDetails(detailsObj);
  if (serialized.ok === false) return;

  await prisma.activityLog.create({
    data: {
      candidateId: params.candidateId,
      applicationId: params.applicationId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      details: serialized.json,
    },
  });
}

/**
 * Log each candidate returned by the job→candidate recommendation APIs.
 */
export async function logCandidatesRecommended(params: {
  jobId: string;
  userId: string | undefined;
  candidates: readonly CandidateRecommendationLogRef[];
}): Promise<void> {
  if (!isValidCuid(params.jobId)) return;

  const rows = (params.candidates ?? [])
    .filter(
      (c) =>
        c &&
        typeof c.candidateId === "string" &&
        isValidCuid(c.candidateId.trim()) &&
        normalizeScore(c.recommendationScore) != null
    )
    .slice(0, MAX_RECOMMENDATION_LOG_ROWS);

  for (const row of rows) {
    try {
      await persistCandidateRecommendationLog({
        action: ACTIVITY_ACTION_CANDIDATE_RECOMMENDED,
        jobId: params.jobId,
        candidateId: row.candidateId.trim(),
        recommendationScore: row.recommendationScore,
        userId: params.userId,
      });
    } catch {
      // Recommendation response must not fail if audit write fails.
    }
  }
}

/**
 * Log recruiter shortlist (application created from a recommendation).
 */
export async function logCandidateShortlisted(params: {
  jobId: string;
  candidateId: string;
  recommendationScore: number;
  userId: string | undefined;
  applicationId?: string;
}): Promise<void> {
  if (!isValidCuid(params.jobId) || !isValidCuid(params.candidateId)) return;

  try {
    await persistCandidateRecommendationLog({
      action: ACTIVITY_ACTION_CANDIDATE_SHORTLISTED,
      jobId: params.jobId,
      candidateId: params.candidateId,
      recommendationScore: params.recommendationScore,
      userId: params.userId,
      applicationId: params.applicationId,
    });
  } catch {
    // Shortlist outcome is authoritative; audit failure must not roll back creates.
  }
}

export async function logCandidatesShortlisted(params: {
  jobId: string;
  userId: string | undefined;
  entries: readonly {
    candidateId: string;
    applicationId: string;
    recommendationScore: number;
  }[];
}): Promise<void> {
  for (const entry of params.entries ?? []) {
    await logCandidateShortlisted({
      jobId: params.jobId,
      candidateId: entry.candidateId,
      recommendationScore: entry.recommendationScore,
      userId: params.userId,
      applicationId: entry.applicationId,
    });
  }
}
