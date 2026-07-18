import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { parseRecruiterQueryIntent } from "@/src/lib/ai/recruiter-query-intent";
import { checkRecruiterAiSearchRateLimit } from "@/src/lib/ai/recruiter-search-rate-limit";
import { searchCandidatesByRecruiterQuery } from "@/src/lib/ai/recruiter-search";
import { logRecruiterAiSearchObservability } from "@/src/lib/recruiter-search-activity-log";
import { canViewCandidates } from "@/src/lib/rbac";

export const runtime = "nodejs";

type SearchCandidatesRequest = {
  query?: unknown;
  /** Client-generated id optional; server assigns if omitted. */
  searchId?: unknown;
};

export type SearchCandidatesResponseRow = {
  candidateId: string;
  candidateName: string;
  finalScore: number;
  semanticScore: number;
  skills: string[];
  currentDesignation: string | null;
  recommendationReason: string;
};

export type SearchCandidatesResponse = {
  searchId: string;
  intent?: {
    mustHaveSkills: string[];
    minimumExperienceYears: number | null;
    locationHint: string | null;
  };
  results: SearchCandidatesResponseRow[];
};

const DEFAULT_LIMIT = 25;

/**
 * POST /api/search/candidates
 *
 * Natural-language recruiter query → embed → owner-scoped vector+FTS RRF → hard filters → re-rank.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const body = (await request.json().catch(() => ({}))) as SearchCandidatesRequest;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const searchId =
    typeof body.searchId === "string" && body.searchId.trim()
      ? body.searchId.trim()
      : randomUUID();

  if (!query) {
    return apiError("INVALID_QUERY", "query is required", 400);
  }

  const rateLimitRes = await checkRecruiterAiSearchRateLimit(userId);
  if (rateLimitRes) return rateLimitRes;

  const startedAt = Date.now();
  const result = await searchCandidatesByRecruiterQuery(query, {
    role,
    userId,
    limit: DEFAULT_LIMIT,
    maxVisiblePool: 5000,
  });
  const durationMs = Date.now() - startedAt;

  if (result.ok === false) {
    const status =
      result.status && result.status >= 400 && result.status < 600
        ? result.status
        : result.code === "INVALID_QUERY"
          ? 400
          : result.code === "RATE_LIMITED"
            ? 429
            : 503;
    const message =
      result.code === "RATE_LIMITED"
        ? "Too many embedding requests. Try again later."
        : process.env.NODE_ENV === "development"
          ? result.error
          : result.code === "INVALID_QUERY"
            ? "query is required"
            : "Search is temporarily unavailable";
    const res = apiError(result.code, message, status);
    if (result.code === "RATE_LIMITED") {
      const match = /retry after (\d+)/i.exec(result.error);
      if (match) res.headers.set("Retry-After", match[1]!);
    }
    return res;
  }

  const intent = parseRecruiterQueryIntent(query);

  const mappedResults = result.results.map((row) => ({
    candidateId: row.candidate.id,
    candidateName: row.candidate.candidateName,
    finalScore: row.finalScore,
    semanticScore: row.semanticScore,
    skills: row.candidate.skills,
    currentDesignation: row.candidate.currentDesignation,
    recommendationReason: row.recommendationReason,
  }));

  void logRecruiterAiSearchObservability({
    searchId,
    query,
    querySkillTokens: intent.requiredSkillTokens,
    results: mappedResults.map((r) => ({
      candidateId: r.candidateId,
      candidateName: r.candidateName,
      finalScore: r.finalScore,
      semanticScore: r.semanticScore,
    })),
    durationMs,
    userId,
  });

  const response = {
    searchId,
    intent: {
      mustHaveSkills: intent.mustHaveSkillTokens,
      minimumExperienceYears: intent.minimumExperienceYears,
      locationHint: intent.locationHint,
    },
    results: mappedResults.map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      finalScore: row.finalScore,
      semanticScore: row.semanticScore,
      skills: row.skills,
      currentDesignation: row.currentDesignation,
      recommendationReason: row.recommendationReason,
    })),
  };

  const cacheHeaders: Record<string, string> = {
    "X-Search-Mode": result.mode,
    "X-Search-Id": searchId,
    "X-Search-Cache-Embedding": result.cache.embedding,
    "X-Search-Cache-Results": result.cache.results,
  };

  return NextResponse.json(response, { headers: cacheHeaders });
}
