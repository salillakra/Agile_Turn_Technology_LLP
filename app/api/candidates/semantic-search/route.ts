import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { checkRecruiterAiSearchRateLimit } from "@/src/lib/ai/recruiter-search-rate-limit";
import { searchCandidatesByRecruiterQuery } from "@/src/lib/ai/recruiter-search";

export const runtime = "nodejs";

type SemanticSearchRequest = {
  query?: unknown;
  limit?: unknown;
  /** Cosine similarity threshold in [0, 1]. */
  minCosineSimilarity?: unknown;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * POST /api/candidates/semantic-search
 *
 * Recruiter natural-language query → embedding → pgvector cosine similarity search on candidates.
 *
 * Body:
 * - `query`: string (required)
 * - `limit`: number (optional, default 25, max 100)
 * - `minCosineSimilarity`: number (optional, 0–1)
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const body = (await request.json().catch(() => ({}))) as SemanticSearchRequest;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return apiError("INVALID_QUERY", "query is required", 400);
  }

  const rateLimitRes = await checkRecruiterAiSearchRateLimit(userId);
  if (rateLimitRes) return rateLimitRes;

  const limitRaw = body.limit;
  const limitNum =
    typeof limitRaw === "number"
      ? limitRaw
      : typeof limitRaw === "string"
        ? Number(limitRaw)
        : NaN;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitNum) ? Math.trunc(limitNum) : DEFAULT_LIMIT)
  );

  const minRaw = body.minCosineSimilarity;
  const minNum =
    typeof minRaw === "number"
      ? minRaw
      : typeof minRaw === "string"
        ? Number(minRaw)
        : NaN;
  const minCosineSimilarity = Number.isFinite(minNum)
    ? Math.min(1, Math.max(0, minNum))
    : undefined;

  const result = await searchCandidatesByRecruiterQuery(query, {
    role,
    userId,
    limit,
    minCosineSimilarity,
    maxVisiblePool: 5000,
  });

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
            : "Embedding service unavailable";
    const res = apiError(result.code, message, status);
    if (result.code === "RATE_LIMITED") {
      const match = /retry after (\d+)/i.exec(result.error);
      if (match) res.headers.set("Retry-After", match[1]!);
    }
    return res;
  }

  return NextResponse.json(
    result.results.map((row) => ({
      candidate: row.candidate,
      finalScore: row.finalScore,
      semanticScore: row.semanticScore,
      skillScore: row.skillScore,
      experienceScore: row.experienceScore,
      locationScore: row.locationScore,
      matchedSkills: row.matchedSkills,
      recommendationReason: row.recommendationReason,
      similarityScore: row.similarityScore,
    })),
    {
      headers: {
        "X-Semantic-Query-Mode": result.mode === "fallback" ? "fallback" : "hybrid-pgvector",
        "X-Search-Cache-Embedding": result.cache.embedding,
        "X-Search-Cache-Results": result.cache.results,
      },
    }
  );
}

