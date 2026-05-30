import { rankCandidatesByJobPgvectorSimilarity } from "@/src/lib/pgvector-similarity";
import { scoreCandidateFit } from "@/src/lib/ai/candidate-scoring-engine";
import type { CandidateRecommendationPoolItem } from "@/src/lib/candidate-recommendation-engine";
import {
  candidateProfileFingerprint,
  getCachedCandidateFit,
  getCachedCandidateScores,
  getCachedJobSemanticRanking,
  setCachedCandidateFit,
  setCachedCandidateScores,
  setCachedJobSemanticRanking,
  type CandidateScoringCacheStatus,
  type CachedCandidateFitPayload,
  buildCandidateScoringScopeKey,
  fingerprintCandidateIds,
  scoringJobFingerprint,
} from "@/src/lib/ai/candidate-scoring-cache";
import type { CandidateScoringThresholds } from "@/src/lib/ai/candidate-scoring-thresholds";

export type JobCandidateScoresResponseRow = {
  candidate: {
    id: string;
    candidateName: string;
    email: string;
    currentDesignation: string | null;
    currentCompany: string | null;
    preferredWorkLocation: string | null;
    skills: string[];
  };
  candidateFitScore: number;
  semanticScore: number;
  matchedSkills: string[];
  recommendationReasons: string[];
};

export type BuildJobCandidateScoresParams = {
  job: {
    id: string;
    title: string;
    location: string;
    yearsOfExperience: number | null;
    requiredSkills: string[];
    preferredSkills: string[];
    jobMeta: unknown;
    embedding: unknown;
    embeddingUpdatedAt?: Date | null;
  };
  pool: readonly (CandidateRecommendationPoolItem & {
    embeddingUpdatedAt?: Date | null;
    updatedAt?: Date;
  })[];
  role: string | undefined;
  userId: string | undefined;
  limit: number;
  minScore: number;
  thresholds: CandidateScoringThresholds;
};

export type BuildJobCandidateScoresResult = {
  results: JobCandidateScoresResponseRow[];
  cache: CandidateScoringCacheStatus;
};

const SEMANTIC_RANK_CAP = 500;

export async function buildJobCandidateScores(
  params: BuildJobCandidateScoresParams
): Promise<BuildJobCandidateScoresResult> {
  const scopeKey = buildCandidateScoringScopeKey(params.role, params.userId);
  const jobFingerprint = scoringJobFingerprint({
    jobId: params.job.id,
    jobMeta: params.job.jobMeta,
    requiredSkills: params.job.requiredSkills,
    preferredSkills: params.job.preferredSkills,
    yearsOfExperience: params.job.yearsOfExperience,
    location: params.job.location,
    title: params.job.title,
    embedding: params.job.embedding,
    embeddingUpdatedAt: params.job.embeddingUpdatedAt ?? null,
  });

  const cache: CandidateScoringCacheStatus = {
    semanticRanking: "miss",
    results: "miss",
    hybridFit: "miss",
  };

  const cachedScores = await getCachedCandidateScores({
    jobId: params.job.id,
    scopeKey,
    limit: params.limit,
    minScore: params.minScore,
    thresholds: params.thresholds,
    jobFingerprint,
  });

  if (cachedScores) {
    cache.results = "hit";
    cache.semanticRanking = "skipped";
    cache.hybridFit = "skipped";
    return {
      results: cachedScores.results as JobCandidateScoresResponseRow[],
      cache,
    };
  }

  const candidateIds = params.pool.map((p) => p.id);
  const candidateFingerprint = fingerprintCandidateIds(candidateIds);

  let semanticRows =
    (await getCachedJobSemanticRanking({
      jobId: params.job.id,
      scopeKey,
      jobFingerprint,
      candidateFingerprint,
      limit: SEMANTIC_RANK_CAP,
    })) ?? null;

  if (!semanticRows && candidateIds.length > 0) {
    try {
      semanticRows = await rankCandidatesByJobPgvectorSimilarity(params.job.id, {
        limit: Math.min(SEMANTIC_RANK_CAP, candidateIds.length),
        entityIds: candidateIds,
      });
      cache.semanticRanking = "miss";
      void setCachedJobSemanticRanking({
        jobId: params.job.id,
        scopeKey,
        jobFingerprint,
        candidateFingerprint,
        limit: SEMANTIC_RANK_CAP,
        rows: semanticRows,
      });
    } catch (e) {
      // pgvector is optional. If the DB is missing the `embedding_vector` column or extension,
      // fall back to in-memory semantic scoring from JSON embeddings.
      const code =
        e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
      const message = e instanceof Error ? e.message : String(e);
      console.warn(
        "[candidate-scoring] pgvector semantic ranking unavailable; falling back to in-memory semantic. code=%s message=%s",
        typeof code === "string" ? code : "unknown",
        message
      );
      semanticRows = [];
      cache.semanticRanking = "skipped";
    }
  } else if (semanticRows) {
    cache.semanticRanking = "hit";
  }

  const cosineById = new Map(
    (semanticRows ?? []).map((r) => [r.entityId, r.cosineSimilarity] as const)
  );

  const jobInput = {
    id: params.job.id,
    title: params.job.title,
    location: params.job.location,
    yearsOfExperience: params.job.yearsOfExperience,
    requiredSkills: params.job.requiredSkills,
    preferredSkills: params.job.preferredSkills,
    jobMeta: params.job.jobMeta,
  };

  let fitHits = 0;
  const scored: JobCandidateScoresResponseRow[] = [];

  for (const candidate of params.pool) {
    const profileFingerprint = candidateProfileFingerprint({
      candidateId: candidate.id,
      normalizedSkills: candidate.normalizedSkills ?? [],
      totalExperience: candidate.totalExperience ?? null,
      relevantExperience: candidate.relevantExperience ?? null,
      preferredWorkLocation: candidate.preferredWorkLocation ?? null,
      currentDesignation: candidate.currentDesignation ?? null,
      hasEmbedding: candidate.embedding != null,
      embeddingUpdatedAt: candidate.embeddingUpdatedAt ?? null,
      profileUpdatedAt: candidate.updatedAt ?? new Date(0),
    });

    let fitPayload: CachedCandidateFitPayload | null = await getCachedCandidateFit({
      jobId: params.job.id,
      candidateId: candidate.id,
      jobFingerprint,
      candidateFingerprint: profileFingerprint,
    });

    if (fitPayload) {
      fitHits += 1;
    } else {
      const pgCosine = cosineById.get(candidate.id) ?? null;
      const result = scoreCandidateFit({
        job: jobInput,
        candidate,
        jobEmbedding: params.job.embedding,
        candidateEmbedding: candidate.embedding,
        pgvectorCosineSimilarity: pgCosine,
        resumeParseStatus: null,
      });

      fitPayload = {
        candidateFitScore: result.candidateFitScore,
        semanticScore: result.semanticScore,
        matchedSkills: result.breakdown.matchedSkills,
        recommendationReasons: result.recommendationReasons,
        cachedAt: new Date().toISOString(),
      };

      void setCachedCandidateFit({
        jobId: params.job.id,
        candidateId: candidate.id,
        jobFingerprint,
        candidateFingerprint: profileFingerprint,
        payload: fitPayload,
      });
    }

    scored.push({
      candidate: {
        id: candidate.id,
        candidateName: candidate.candidateName,
        email: candidate.email ?? "",
        currentDesignation: candidate.currentDesignation ?? null,
        currentCompany:
          "currentCompany" in candidate && typeof candidate.currentCompany === "string"
            ? candidate.currentCompany
            : null,
        preferredWorkLocation: candidate.preferredWorkLocation ?? null,
        skills: candidate.skills ?? [],
      },
      candidateFitScore: fitPayload.candidateFitScore,
      semanticScore: fitPayload.semanticScore,
      matchedSkills: fitPayload.matchedSkills,
      recommendationReasons: fitPayload.recommendationReasons,
    });
  }

  if (fitHits === params.pool.length && params.pool.length > 0) {
    cache.hybridFit = "hit";
  } else if (fitHits > 0) {
    cache.hybridFit = "miss";
  } else {
    cache.hybridFit = params.pool.length === 0 ? "skipped" : "miss";
  }

  scored.sort((a, b) => {
    if (b.candidateFitScore !== a.candidateFitScore) return b.candidateFitScore - a.candidateFitScore;
    if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  const filtered = scored
    .filter((r) => r.candidateFitScore >= params.minScore)
    .slice(0, params.limit);

  void setCachedCandidateScores({
    jobId: params.job.id,
    scopeKey,
    limit: params.limit,
    minScore: params.minScore,
    thresholds: params.thresholds,
    jobFingerprint,
    poolCandidateIds: candidateIds,
    results: filtered,
  });

  return { results: filtered, cache };
}
