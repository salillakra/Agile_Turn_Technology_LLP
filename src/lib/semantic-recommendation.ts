import {
  compareEmbeddings,
  cosineSimilarity,
  extractEmbeddingVector,
} from "@/src/lib/vector-similarity";

export type SemanticJobRecommendation = {
  jobId: string;
  title: string;
  /** Cosine similarity expressed as 0–100 (one decimal), aligned with rule-based `matchScore`. */
  semanticScore: number;
};

export type SemanticRecommendationJobInput = {
  jobId: string;
  title: string;
  embedding: unknown;
};

export type SemanticCandidateRecommendation = {
  candidateId: string;
  candidateName: string;
  /** Cosine similarity expressed as 0–100 (one decimal). */
  semanticScore: number;
};

export type SemanticRecommendationCandidateInput = {
  candidateId: string;
  candidateName: string;
  embedding: unknown;
};

function toSemanticScorePercent(cosine: number): number {
  return Math.round(cosine * 1000) / 10;
}

/**
 * Score one job against a candidate embedding. Returns null when either vector is missing/invalid.
 */
export function scoreJobSemanticSimilarity(
  candidateEmbedding: unknown,
  jobEmbedding: unknown
): number | null {
  return scoreJobAgainstCandidateSemanticSimilarity(jobEmbedding, candidateEmbedding);
}

/**
 * Reverse direction: compare stored job embedding to stored candidate embedding.
 *
 * 1. Parse `Job.embedding` and `Candidate.embedding` vectors from JSON.
 * 2. Compute cosine similarity in [0, 1].
 * 3. Scale to `semanticScore` 0–100.
 *
 * Returns `null` when either vector is missing or invalid (no AI call).
 */
export function scoreJobAgainstCandidateSemanticSimilarity(
  jobEmbedding: unknown,
  candidateEmbedding: unknown
): number | null {
  const jobVector = extractEmbeddingVector(jobEmbedding);
  const candidateVector = extractEmbeddingVector(candidateEmbedding);
  if (!jobVector || !candidateVector) {
    return null;
  }

  try {
    const cosine = cosineSimilarity(jobVector, candidateVector);
    return toSemanticScorePercent(cosine);
  } catch {
    return null;
  }
}

/**
 * Rank candidates by semantic similarity to one job embedding (stored vectors only).
 */
export function rankCandidatesBySemanticSimilarity(
  jobEmbedding: unknown,
  candidates: readonly SemanticRecommendationCandidateInput[]
): SemanticCandidateRecommendation[] {
  const jobVector = extractEmbeddingVector(jobEmbedding);
  if (!jobVector) {
    return [];
  }

  const scored: SemanticCandidateRecommendation[] = [];

  for (const candidate of candidates ?? []) {
    const candidateVector = extractEmbeddingVector(candidate.embedding);
    if (!candidateVector) continue;

    try {
      const cosine = cosineSimilarity(jobVector, candidateVector);
      scored.push({
        candidateId: candidate.candidateId,
        candidateName: candidate.candidateName,
        semanticScore: toSemanticScorePercent(cosine),
      });
    } catch {
      continue;
    }
  }

  scored.sort((a, b) => {
    if (b.semanticScore !== a.semanticScore) {
      return b.semanticScore - a.semanticScore;
    }
    return a.candidateId.localeCompare(b.candidateId);
  });

  return scored;
}

/**
 * Compare candidate embedding to each job embedding, rank by semantic similarity descending.
 * Jobs without a valid embedding are omitted.
 */
export function rankJobsBySemanticSimilarity(
  candidateEmbedding: unknown,
  jobs: readonly SemanticRecommendationJobInput[]
): SemanticJobRecommendation[] {
  const candidateVector = extractEmbeddingVector(candidateEmbedding);
  if (!candidateVector) {
    return [];
  }

  const scored: SemanticJobRecommendation[] = [];

  for (const job of jobs ?? []) {
    const jobVector = extractEmbeddingVector(job.embedding);
    if (!jobVector) continue;

    try {
      const cosine = cosineSimilarity(candidateVector, jobVector);
      scored.push({
        jobId: job.jobId,
        title: job.title,
        semanticScore: toSemanticScorePercent(cosine),
      });
    } catch {
      continue;
    }
  }

  scored.sort((a, b) => {
    if (b.semanticScore !== a.semanticScore) {
      return b.semanticScore - a.semanticScore;
    }
    return a.jobId.localeCompare(b.jobId);
  });

  return scored;
}
