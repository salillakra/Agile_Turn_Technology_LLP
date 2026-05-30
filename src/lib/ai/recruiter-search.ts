import {
  getCachedRecruiterSearchResults,
  normalizeRecruiterSearchQuery,
  peekRecruiterQueryEmbeddingCache,
  resolveRecruiterQueryEmbedding,
  setCachedRecruiterSearchResults,
  type RecruiterSearchCacheStatus,
} from "@/src/lib/ai/recruiter-search-cache";
import { computeRecruiterHybridScore } from "@/src/lib/ai/recruiter-hybrid-ranking";
import { buildRecruiterSearchRecommendationReason } from "@/src/lib/ai/recruiter-search-explainability";
import { parseRecruiterQueryIntent } from "@/src/lib/ai/recruiter-query-intent";
import { buildCandidateVisibilityWhere } from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import {
  rankCandidatesByQueryEmbedding,
  type RankByPgvectorCosineSimilarityOptions,
} from "@/src/lib/pgvector-similarity";
import { normalizeSkills } from "@/src/lib/skill-normalizer";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";

export { extractQuerySkillTokens } from "@/src/lib/ai/recruiter-query-intent";

export type RecruiterSearchCandidate = {
  id: string;
  candidateName: string;
  email: string;
  currentCompany: string | null;
  currentDesignation: string | null;
  totalExperience: number | null;
  preferredWorkLocation: string | null;
  skills: string[];
  normalizedSkills: string[];
};

export type RecruiterSearchResultRow = {
  candidate: RecruiterSearchCandidate;
  /** Weighted blend: 50% semantic + 30% skill + 15% experience + 5% location. */
  finalScore: number;
  /** Cosine similarity on query embedding vs candidate (0–100). */
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  matchedSkills: string[];
  recommendationReason: string;
  /** @deprecated Use `semanticScore`. */
  similarityScore: number;
};

export type RecruiterSemanticSearchOptions = {
  role: string | undefined;
  userId: string | undefined;
  /** Max candidates returned after hybrid re-rank (default 25, max 100). */
  limit?: number;
  /** Minimum cosine similarity in [0, 1] for pgvector retrieval. */
  minCosineSimilarity?: number;
  /** Cap candidate pool for RBAC-scoped ID filter (default 5000). */
  maxVisiblePool?: number;
};

type SearchCandidatesResponse =
  | {
      ok: true;
      mode: "hybrid" | "fallback";
      results: RecruiterSearchResultRow[];
      cache: RecruiterSearchCacheStatus;
    }
  | {
      ok: false;
      code: "INVALID_QUERY" | "EMBEDDING_FAILED" | "RATE_LIMITED";
      error: string;
      status?: number;
    };

const SEMANTIC_RETRIEVAL_MULTIPLIER = 4;

function resolveCandidateSkills(params: {
  skills: string[];
  normalizedSkills: string[];
  candidateSkills: { skillName: string }[];
}): { rawSkills: string[]; normalizedSkills: string[] } {
  const rawSkills =
    params.skills.length > 0
      ? params.skills
      : params.candidateSkills.map((s) => s.skillName).filter(Boolean);

  const normalized =
    params.normalizedSkills.length > 0 ? params.normalizedSkills : normalizeSkills(rawSkills);

  return { rawSkills, normalizedSkills: normalized };
}

function toRecommendationCandidate(
  c: {
    id: string;
    totalExperience: number | null;
    preferredWorkLocation: string | null;
    normalizedSkills: string[];
    skills: string[];
    candidateSkills: { skillName: string }[];
  },
  resolved: { rawSkills: string[]; normalizedSkills: string[] }
): RecommendationCandidateInput {
  return {
    id: c.id,
    skills: resolved.rawSkills,
    normalizedSkills: resolved.normalizedSkills,
    totalExperience: c.totalExperience,
    preferredWorkLocation: c.preferredWorkLocation,
  };
}

function compareHybridSearchResults(a: RecruiterSearchResultRow, b: RecruiterSearchResultRow): number {
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
  if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
  if (b.skillScore !== a.skillScore) return b.skillScore - a.skillScore;
  return a.candidate.id.localeCompare(b.candidate.id);
}

function clampScorePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function computeSkillOverlapPercent(params: {
  required: readonly string[];
  candidateNormalized: readonly string[];
}): number {
  const required = params.required.filter(Boolean);
  if (required.length === 0) return 0;
  const cand = new Set(params.candidateNormalized.filter(Boolean));
  let hit = 0;
  for (const token of required) {
    if (cand.has(token)) hit += 1;
  }
  return clampScorePercent((hit / required.length) * 100);
}

async function fallbackSearchCandidates(params: {
  query: string;
  options: RecruiterSemanticSearchOptions;
  limit: number;
}): Promise<RecruiterSearchResultRow[]> {
  const normalizedQuery = normalizeRecruiterSearchQuery(params.query);
  const intent = parseRecruiterQueryIntent(normalizedQuery);
  const requiredTokens = intent.requiredSkillTokens;
  const locationHint = intent.locationHint?.trim() || null;

  const candidates = await prisma.candidate.findMany({
    where: {
      ...buildCandidateVisibilityWhere(params.options.role, params.options.userId),
      OR: [
        requiredTokens.length > 0 ? { normalizedSkills: { hasSome: requiredTokens } } : undefined,
        requiredTokens.length > 0
          ? { candidateSkills: { some: { skillName: { in: requiredTokens } } } }
          : undefined,
        locationHint
          ? { preferredWorkLocation: { contains: locationHint, mode: "insensitive" } }
          : undefined,
        normalizedQuery
          ? { currentDesignation: { contains: normalizedQuery, mode: "insensitive" } }
          : undefined,
      ].filter(Boolean) as any[],
    },
    take: Math.min(250, Math.max(params.limit * 8, params.limit)),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidateName: true,
      email: true,
      currentCompany: true,
      currentDesignation: true,
      totalExperience: true,
      preferredWorkLocation: true,
      skills: true,
      normalizedSkills: true,
      candidateSkills: { select: { skillName: true } },
    },
  });

  const rows: RecruiterSearchResultRow[] = [];

  for (const c of candidates) {
    const resolved = resolveCandidateSkills({
      skills: c.skills ?? [],
      normalizedSkills: c.normalizedSkills ?? [],
      candidateSkills: c.candidateSkills ?? [],
    });

    const candidateInput = toRecommendationCandidate(c, resolved);
    const pseudoSemantic = computeSkillOverlapPercent({
      required: requiredTokens,
      candidateNormalized: resolved.normalizedSkills,
    });

    const hybrid = computeRecruiterHybridScore({
      candidate: candidateInput,
      intent,
      semanticScore: pseudoSemantic,
    });

    const recommendationReason = buildRecruiterSearchRecommendationReason({
      query: normalizedQuery,
      intent,
      hybrid,
      candidateDesignation: c.currentDesignation,
      candidatePreferredLocation: c.preferredWorkLocation,
    });

    rows.push({
      candidate: {
        id: c.id,
        candidateName: c.candidateName,
        email: c.email,
        currentCompany: c.currentCompany,
        currentDesignation: c.currentDesignation,
        totalExperience: c.totalExperience,
        preferredWorkLocation: c.preferredWorkLocation,
        skills: resolved.rawSkills,
        normalizedSkills: resolved.normalizedSkills,
      },
      finalScore: hybrid.finalScore,
      semanticScore: hybrid.semanticScore,
      skillScore: hybrid.skillScore,
      experienceScore: hybrid.experienceScore,
      locationScore: hybrid.locationScore,
      matchedSkills: hybrid.matchedSkills,
      recommendationReason,
      similarityScore: hybrid.semanticScore,
    });
  }

  rows.sort(compareHybridSearchResults);
  return rows.slice(0, params.limit);
}

/**
 * Recruiter NL query → embed → pgvector retrieval → hybrid re-rank → top matches.
 *
 * Hybrid: {@link HYBRID_RECOMMENDATION_WEIGHTS} — semantic, skill overlap, experience, location.
 */
export async function searchCandidatesByRecruiterQuery(
  query: string,
  options: RecruiterSemanticSearchOptions
): Promise<SearchCandidatesResponse> {
  const normalizedQuery = normalizeRecruiterSearchQuery(
    typeof query === "string" ? query : ""
  );
  if (!normalizedQuery) {
    return { ok: false, code: "INVALID_QUERY", error: "query is required", status: 400 };
  }

  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 25)));
  const cacheParams = {
    query: normalizedQuery,
    role: options.role,
    userId: options.userId,
    limit,
    minCosineSimilarity: options.minCosineSimilarity,
  };

  const cachedResults = await getCachedRecruiterSearchResults(cacheParams);
  if (cachedResults != null) {
    const embeddingCache = await peekRecruiterQueryEmbeddingCache(normalizedQuery);
    return {
      ok: true,
      mode: "hybrid",
      results: cachedResults.slice(0, limit),
      cache: { embedding: embeddingCache, results: "hit" },
    };
  }

  const embedded = await resolveRecruiterQueryEmbedding(normalizedQuery, {
    userId: options.userId,
  });
  if (embedded.ok === false) {
    if (embedded.code !== "RATE_LIMITED") {
      const results = await fallbackSearchCandidates({ query: normalizedQuery, options, limit });
      await setCachedRecruiterSearchResults({
        ...cacheParams,
        results,
        successful: true,
      });
      return {
        ok: true,
        mode: "fallback",
        results,
        cache: { embedding: "miss", results: "miss" },
      };
    }
    return {
      ok: false,
      code: embedded.code === "RATE_LIMITED" ? "RATE_LIMITED" : "EMBEDDING_FAILED",
      error: embedded.error,
      status: embedded.status,
    };
  }

  const semanticLimit = Math.min(100, limit * SEMANTIC_RETRIEVAL_MULTIPLIER);
  const maxVisiblePool = Math.min(50_000, Math.max(1, Math.trunc(options.maxVisiblePool ?? 5000)));
  const queryIntent = parseRecruiterQueryIntent(normalizedQuery);

  const visible = await prisma.candidate.findMany({
    where: {
      ...buildCandidateVisibilityWhere(options.role, options.userId),
      // Use JSON embedding presence for compatibility when Prisma client types
      // are out of sync with `embeddingVector` (pgvector) field generation.
      embedding: { not: null },
    },
    select: { id: true },
    take: maxVisiblePool,
    orderBy: { createdAt: "desc" },
  });

  const visibleIds = visible.map((c) => c.id);
  if (visibleIds.length === 0) {
    const empty: RecruiterSearchResultRow[] = [];
    await setCachedRecruiterSearchResults({
      ...cacheParams,
      results: empty,
      successful: true,
    });
    return {
      ok: true,
      mode: "hybrid",
      results: empty,
      cache: { embedding: embedded.cache, results: "miss" },
    };
  }

  const rankOptions: RankByPgvectorCosineSimilarityOptions = {
    limit: semanticLimit,
    minCosineSimilarity: options.minCosineSimilarity,
    entityIds: visibleIds,
  };

  const ranked = await rankCandidatesByQueryEmbedding(embedded.embedding, rankOptions);
  if (ranked.length === 0) {
    const empty: RecruiterSearchResultRow[] = [];
    await setCachedRecruiterSearchResults({
      ...cacheParams,
      results: empty,
      successful: true,
    });
    return {
      ok: true,
      mode: "hybrid",
      results: empty,
      cache: { embedding: embedded.cache, results: "miss" },
    };
  }

  const rankedIds = ranked.map((r) => r.entityId);
  const candidates = await prisma.candidate.findMany({
    where: { id: { in: rankedIds } },
    select: {
      id: true,
      candidateName: true,
      email: true,
      currentCompany: true,
      currentDesignation: true,
      totalExperience: true,
      preferredWorkLocation: true,
      skills: true,
      normalizedSkills: true,
      candidateSkills: { select: { skillName: true } },
    },
  });

  const semanticById = new Map(ranked.map((r) => [r.entityId, r.semanticScore] as const));
  const byId = new Map(candidates.map((c) => [c.id, c] as const));

  const hybridRows: RecruiterSearchResultRow[] = [];

  for (const row of ranked) {
    const c = byId.get(row.entityId);
    if (!c) continue;

    const resolved = resolveCandidateSkills({
      skills: c.skills ?? [],
      normalizedSkills: c.normalizedSkills ?? [],
      candidateSkills: c.candidateSkills ?? [],
    });

    const candidateInput = toRecommendationCandidate(c, resolved);
    const semanticScore = semanticById.get(c.id) ?? row.semanticScore;

    const hybrid = computeRecruiterHybridScore({
      candidate: candidateInput,
      intent: queryIntent,
      semanticScore,
    });

    const recommendationReason = buildRecruiterSearchRecommendationReason({
      query: normalizedQuery,
      intent: queryIntent,
      hybrid,
      candidateDesignation: c.currentDesignation,
      candidatePreferredLocation: c.preferredWorkLocation,
    });

    hybridRows.push({
      candidate: {
        id: c.id,
        candidateName: c.candidateName,
        email: c.email,
        currentCompany: c.currentCompany,
        currentDesignation: c.currentDesignation,
        totalExperience: c.totalExperience,
        preferredWorkLocation: c.preferredWorkLocation,
        skills: resolved.rawSkills,
        normalizedSkills: resolved.normalizedSkills,
      },
      finalScore: hybrid.finalScore,
      semanticScore: hybrid.semanticScore,
      skillScore: hybrid.skillScore,
      experienceScore: hybrid.experienceScore,
      locationScore: hybrid.locationScore,
      matchedSkills: hybrid.matchedSkills,
      recommendationReason,
      similarityScore: hybrid.semanticScore,
    });
  }

  hybridRows.sort(compareHybridSearchResults);

  const results = hybridRows.slice(0, limit);
  await setCachedRecruiterSearchResults({
    ...cacheParams,
    results,
    successful: true,
  });

  return {
    ok: true,
    mode: "hybrid",
    results,
    cache: { embedding: embedded.cache, results: "miss" },
  };
}
