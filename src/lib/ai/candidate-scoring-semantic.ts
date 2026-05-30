import { computeJobCandidateSemanticSimilarity } from "@/src/lib/candidate-recommendation-engine";
import { getJobCandidatePgvectorSimilarity } from "@/src/lib/pgvector-similarity";
import {
  cosineSimilarityFromPgvectorDistance,
  extractEmbeddingVector,
  semanticScoreFromCosine,
} from "@/src/lib/vector-similarity";

export type CandidateSemanticSignalSource = "pgvector" | "in_memory" | "unavailable";

export type CandidateSemanticSignal = {
  semanticScore: number;
  /** Normalized cosine similarity in [0, 1]. */
  cosineSimilarity: number | null;
  semanticAvailable: boolean;
  source: CandidateSemanticSignalSource;
  hasJobEmbedding: boolean;
  hasCandidateEmbedding: boolean;
};

/**
 * Clamp pgvector / SQL cosine output to [0, 1].
 */
export function normalizePgvectorCosineSimilarity(
  value: number | string | null | undefined
): number | null {
  const raw = typeof value === "string" ? Number(value) : value;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Map normalized cosine [0, 1] → semanticScore [0, 100] (one decimal).
 * Aligns with `semanticScoreFromCosine` used across pgvector ranking.
 */
export function semanticScoreFromNormalizedCosine(cosine: number): number {
  return semanticScoreFromCosine(cosine);
}

function buildSemanticSignal(params: {
  cosineSimilarity: number | null;
  source: CandidateSemanticSignalSource;
  hasJobEmbedding: boolean;
  hasCandidateEmbedding: boolean;
}): CandidateSemanticSignal {
  const cosine = params.cosineSimilarity;
  const semanticAvailable = cosine != null;

  return {
    cosineSimilarity: cosine,
    semanticScore: cosine != null ? semanticScoreFromNormalizedCosine(cosine) : 0,
    semanticAvailable,
    source: params.source,
    hasJobEmbedding: params.hasJobEmbedding,
    hasCandidateEmbedding: params.hasCandidateEmbedding,
  };
}

/**
 * Resolve semantic similarity via pgvector (`embedding_vector` <=> operator).
 */
export async function resolveCandidateSemanticFromPgvector(
  jobId: string,
  candidateId: string
): Promise<CandidateSemanticSignal> {
  const pg = await getJobCandidatePgvectorSimilarity(jobId, candidateId);
  if (!pg) {
    return buildSemanticSignal({
      cosineSimilarity: null,
      source: "unavailable",
      hasJobEmbedding: false,
      hasCandidateEmbedding: false,
    });
  }

  return buildSemanticSignal({
    cosineSimilarity: pg.cosineSimilarity,
    source: "pgvector",
    hasJobEmbedding: true,
    hasCandidateEmbedding: true,
  });
}

/**
 * Fallback: cosine on JSON `embedding` vectors in application memory.
 */
export function resolveCandidateSemanticFromEmbeddings(
  jobEmbedding: unknown,
  candidateEmbedding: unknown
): CandidateSemanticSignal {
  const jobVector = extractEmbeddingVector(jobEmbedding);
  const candidateVector = extractEmbeddingVector(candidateEmbedding);
  const match = computeJobCandidateSemanticSimilarity(jobEmbedding, candidateEmbedding);

  const cosine =
    match.cosineSimilarity != null
      ? normalizePgvectorCosineSimilarity(match.cosineSimilarity)
      : null;

  const source: CandidateSemanticSignalSource =
    cosine != null && jobVector && candidateVector ? "in_memory" : "unavailable";

  return buildSemanticSignal({
    cosineSimilarity: cosine,
    source,
    hasJobEmbedding: match.hasJobEmbedding,
    hasCandidateEmbedding: match.hasCandidateEmbedding,
  });
}

/**
 * Prefer pgvector DB similarity; optional pre-fetched cosine skips a round trip.
 */
export async function resolveCandidateSemanticSignal(params: {
  jobId?: string;
  candidateId?: string;
  jobEmbedding?: unknown | null;
  candidateEmbedding?: unknown | null;
  pgvectorCosineSimilarity?: number | null;
}): Promise<CandidateSemanticSignal> {
  const preNormalized = normalizePgvectorCosineSimilarity(params.pgvectorCosineSimilarity);
  if (preNormalized != null) {
    return buildSemanticSignal({
      cosineSimilarity: preNormalized,
      source: "pgvector",
      hasJobEmbedding: true,
      hasCandidateEmbedding: true,
    });
  }

  const jobId = params.jobId?.trim();
  const candidateId = params.candidateId?.trim();
  if (jobId && candidateId) {
    const pg = await resolveCandidateSemanticFromPgvector(jobId, candidateId);
    if (pg.semanticAvailable) return pg;
  }

  return resolveCandidateSemanticFromEmbeddings(
    params.jobEmbedding ?? null,
    params.candidateEmbedding ?? null
  );
}

/** @deprecated Use {@link normalizePgvectorCosineSimilarity} — distance → similarity helper. */
export function pgvectorDistanceToCosineSimilarity(distance: number): number {
  return cosineSimilarityFromPgvectorDistance(distance);
}
