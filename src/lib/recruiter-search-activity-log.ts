import {
  ACTIVITY_ACTION_AI_SEARCH_PERFORMED,
  ACTIVITY_ACTION_CANDIDATE_AI_MATCHED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_EXECUTED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_RESULT_CLICKED,
  ACTIVITY_ACTION_RECRUITER_AI_SEARCH_SHORTLISTED,
  buildAiSearchPerformedDetails,
  buildCandidateAiMatchedDetails,
  serializeActivityLogDetails,
  type RecruiterAiSearchClickDetails,
  type RecruiterAiSearchExecutedDetails,
  type RecruiterAiSearchShortlistDetails,
} from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

const MAX_QUERY_LENGTH = 500;
const MAX_CANDIDATE_MATCH_LOGS = 25;

function truncateQuery(query: string): string {
  const q = query.trim();
  if (q.length <= MAX_QUERY_LENGTH) return q;
  return `${q.slice(0, MAX_QUERY_LENGTH - 1)}…`;
}

export type RecruiterAiSearchResultForLog = {
  candidateId: string;
  candidateName: string;
  finalScore: number;
  semanticScore: number;
};

async function writeActivityLog(params: {
  action: string;
  userId: string | undefined;
  candidateId?: string;
  applicationId?: string;
  details: unknown;
}): Promise<void> {
  const serialized = serializeActivityLogDetails(params.details);
  if (!serialized.ok) return;

  await prisma.activityLog.create({
    data: {
      userId: params.userId ?? null,
      candidateId: params.candidateId ?? null,
      applicationId: params.applicationId ?? null,
      action: params.action,
      details: serialized.json,
    },
  });
}

/**
 * Primary AI observability hook: one `AI_SEARCH_PERFORMED` + one `CANDIDATE_AI_MATCHED` per result.
 * Also writes legacy `RECRUITER_AI_SEARCH_EXECUTED` for existing analytics dashboards.
 */
export async function logRecruiterAiSearchObservability(params: {
  searchId: string;
  query: string;
  querySkillTokens: readonly string[];
  results: readonly RecruiterAiSearchResultForLog[];
  durationMs?: number;
  userId: string | undefined;
}): Promise<void> {
  const searchId = params.searchId.trim();
  const query = truncateQuery(params.query);
  if (!searchId || !query) return;

  const results = params.results ?? [];
  const top = results[0];
  const topResult =
    top && isValidCuid(top.candidateId)
      ? { candidateId: top.candidateId, candidateName: top.candidateName.trim() || "Candidate" }
      : null;

  try {
    await writeActivityLog({
      action: ACTIVITY_ACTION_AI_SEARCH_PERFORMED,
      userId: params.userId,
      candidateId: topResult?.candidateId,
      details: buildAiSearchPerformedDetails({
        searchId,
        query,
        topResult,
        similarityScore: top?.finalScore ?? 0,
        semanticScore: top?.semanticScore,
        resultCount: results.length,
        durationMs: params.durationMs,
        querySkillTokens: params.querySkillTokens,
      }),
    });
  } catch {
    // Non-blocking
  }

  const legacyDetails: RecruiterAiSearchExecutedDetails = {
    searchId,
    query,
    querySkillTokens: [...params.querySkillTokens],
    resultCount: results.length,
    success: results.length > 0,
    ...(params.durationMs != null && Number.isFinite(params.durationMs)
      ? { durationMs: Math.trunc(params.durationMs) }
      : {}),
    ...(top?.finalScore != null ? { topFinalScore: top.finalScore } : {}),
  };

  try {
    await writeActivityLog({
      action: ACTIVITY_ACTION_RECRUITER_AI_SEARCH_EXECUTED,
      userId: params.userId,
      details: legacyDetails,
    });
  } catch {
    // Non-blocking
  }

  for (let i = 0; i < Math.min(results.length, MAX_CANDIDATE_MATCH_LOGS); i += 1) {
    const row = results[i]!;
    if (!isValidCuid(row.candidateId)) continue;
    try {
      await writeActivityLog({
        action: ACTIVITY_ACTION_CANDIDATE_AI_MATCHED,
        userId: params.userId,
        candidateId: row.candidateId,
        details: buildCandidateAiMatchedDetails({
          searchId,
          query,
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          similarityScore: row.finalScore,
          semanticScore: row.semanticScore,
          rankPosition: i,
        }),
      });
    } catch {
      // Continue logging remaining rows
    }
  }
}

/** @deprecated Use {@link logRecruiterAiSearchObservability}. */
export async function logRecruiterAiSearchExecuted(params: {
  searchId: string;
  query: string;
  querySkillTokens: readonly string[];
  resultCount: number;
  durationMs?: number;
  topFinalScore?: number;
  userId: string | undefined;
}): Promise<void> {
  await logRecruiterAiSearchObservability({
    searchId: params.searchId,
    query: params.query,
    querySkillTokens: params.querySkillTokens,
    results: [],
    durationMs: params.durationMs,
    userId: params.userId,
  });
}

/** Log recruiter interaction with a search result row. */
export async function logRecruiterAiSearchResultClicked(params: {
  searchId: string;
  candidateId: string;
  clickType: RecruiterAiSearchClickDetails["clickType"];
  userId: string | undefined;
  finalScore?: number;
  semanticScore?: number;
  rankPosition?: number;
}): Promise<void> {
  const searchId = params.searchId.trim();
  const candidateId = params.candidateId.trim();
  if (!searchId || !isValidCuid(candidateId)) return;

  const details: RecruiterAiSearchClickDetails = {
    searchId,
    candidateId,
    clickType: params.clickType,
    ...(params.finalScore != null && Number.isFinite(params.finalScore)
      ? { finalScore: Math.round(params.finalScore * 10) / 10 }
      : {}),
    ...(params.semanticScore != null && Number.isFinite(params.semanticScore)
      ? { semanticScore: Math.round(params.semanticScore * 10) / 10 }
      : {}),
    ...(params.rankPosition != null && params.rankPosition >= 0
      ? { rankPosition: Math.trunc(params.rankPosition) }
      : {}),
  };

  try {
    await writeActivityLog({
      action: ACTIVITY_ACTION_RECRUITER_AI_SEARCH_RESULT_CLICKED,
      userId: params.userId,
      candidateId,
      details,
    });
  } catch {
    // UI telemetry must not block recruiter actions.
  }
}

/** Log pipeline shortlist originating from AI search. */
export async function logRecruiterAiSearchShortlisted(params: {
  searchId: string;
  jobId: string;
  candidateId: string;
  applicationId?: string;
  finalScore?: number;
  userId: string | undefined;
}): Promise<void> {
  const searchId = params.searchId.trim();
  const jobId = params.jobId.trim();
  const candidateId = params.candidateId.trim();
  if (!searchId || !isValidCuid(jobId) || !isValidCuid(candidateId)) return;

  const details: RecruiterAiSearchShortlistDetails = {
    searchId,
    jobId,
    candidateId,
    ...(params.applicationId ? { applicationId: params.applicationId } : {}),
    ...(params.finalScore != null && Number.isFinite(params.finalScore)
      ? { finalScore: Math.round(params.finalScore * 10) / 10 }
      : {}),
  };

  try {
    await writeActivityLog({
      action: ACTIVITY_ACTION_RECRUITER_AI_SEARCH_SHORTLISTED,
      userId: params.userId,
      candidateId,
      applicationId: params.applicationId,
      details,
    });
  } catch {
    // Shortlist outcome is authoritative.
  }
}
