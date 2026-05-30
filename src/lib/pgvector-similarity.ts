import {
  queryJobCandidatePgvectorCosineSimilarity,
  queryTopCandidatesByCosineSimilarity,
  queryTopCandidatesByJobEmbeddingCosineSimilarity,
  queryTopJobsByCandidateEmbeddingCosineSimilarity,
  queryTopJobsByCosineSimilarity,
  type PgvectorCosineSimilaritySqlRow,
} from "@/src/lib/pgvector-similarity-queries";
import {
  extractEmbeddingVector,
  semanticScoreFromCosine,
} from "@/src/lib/vector-similarity";

export type PgvectorEntityTable = "candidates" | "jobs";

export type PgvectorSimilarityRankRow = {
  entityId: string;
  /** Cosine similarity in [0, 1] from pgvector `<=>` distance. */
  cosineSimilarity: number;
  /** Same scale as `semanticScore` elsewhere (0–100, one decimal). */
  semanticScore: number;
};

export type RankByPgvectorCosineSimilarityOptions = {
  /** Max rows returned (default 50). */
  limit?: number;
  /** Minimum cosine similarity in [0, 1] (default 0). */
  minCosineSimilarity?: number;
  /** Restrict search to these entity ids (optional). */
  entityIds?: readonly string[];
};

function parseCosineFromPgvectorRow(
  value: number | string | null | undefined
): number | null {
  const raw = typeof value === "string" ? Number(value) : value;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.min(1, Math.max(0, raw));
}

function mapSqlRowsToRanked(rows: PgvectorCosineSimilaritySqlRow[]): PgvectorSimilarityRankRow[] {
  const ranked: PgvectorSimilarityRankRow[] = [];

  for (const row of rows) {
    const cosineSimilarity = parseCosineFromPgvectorRow(row.cosineSimilarity);
    if (cosineSimilarity == null) continue;

    ranked.push({
      entityId: row.entityId,
      cosineSimilarity,
      semanticScore: semanticScoreFromCosine(cosineSimilarity),
    });
  }

  // SQL orders DESC; stable tie-break for equal scores.
  ranked.sort((a, b) => {
    if (b.cosineSimilarity !== a.cosineSimilarity) {
      return b.cosineSimilarity - a.cosineSimilarity;
    }
    return a.entityId.localeCompare(b.entityId);
  });

  return ranked;
}

/**
 * Compare a query embedding against rows in `candidates` or `jobs` using pgvector cosine distance.
 * Delegates to `pgvector-similarity-queries` (ORDER BY similarity DESC, LIMIT top-N, threshold filter).
 */
export async function rankEntitiesByPgvectorCosineSimilarity(
  table: PgvectorEntityTable,
  queryVector: readonly number[],
  options: RankByPgvectorCosineSimilarityOptions = {}
): Promise<PgvectorSimilarityRankRow[]> {
  const sqlOpts = {
    limit: options.limit,
    minCosineSimilarity: options.minCosineSimilarity,
  };

  const rows =
    table === "candidates"
      ? await queryTopCandidatesByCosineSimilarity(queryVector, {
          ...sqlOpts,
          candidateIds: options.entityIds,
        })
      : await queryTopJobsByCosineSimilarity(queryVector, {
          ...sqlOpts,
          jobIds: options.entityIds,
        });

  return mapSqlRowsToRanked(rows);
}

/** Rank candidates by cosine similarity to an in-memory query embedding. */
export function rankCandidatesByQueryEmbedding(
  queryVector: readonly number[],
  options?: RankByPgvectorCosineSimilarityOptions
): Promise<PgvectorSimilarityRankRow[]> {
  return rankEntitiesByPgvectorCosineSimilarity("candidates", queryVector, options);
}

/** Rank jobs by cosine similarity to an in-memory query embedding. */
export function rankJobsByQueryEmbedding(
  queryVector: readonly number[],
  options?: RankByPgvectorCosineSimilarityOptions
): Promise<PgvectorSimilarityRankRow[]> {
  return rankEntitiesByPgvectorCosineSimilarity("jobs", queryVector, options);
}

/** Parse stored JSON embedding, then rank candidates via pgvector. */
export async function rankCandidatesByStoredQueryEmbedding(
  queryEmbedding: unknown,
  options?: RankByPgvectorCosineSimilarityOptions
): Promise<PgvectorSimilarityRankRow[]> {
  const queryVector = extractEmbeddingVector(queryEmbedding);
  if (!queryVector) return [];
  return rankCandidatesByQueryEmbedding(queryVector, options);
}

/** Parse stored JSON embedding, then rank jobs via pgvector. */
export async function rankJobsByStoredQueryEmbedding(
  queryEmbedding: unknown,
  options?: RankByPgvectorCosineSimilarityOptions
): Promise<PgvectorSimilarityRankRow[]> {
  const queryVector = extractEmbeddingVector(queryEmbedding);
  if (!queryVector) return [];
  return rankJobsByQueryEmbedding(queryVector, options);
}

export type JobCandidatePgvectorSimilarity = {
  cosineSimilarity: number;
  semanticScore: number;
};

/**
 * pgvector cosine similarity for one job↔candidate pair (`embedding_vector` <=> operator).
 */
export async function getJobCandidatePgvectorSimilarity(
  jobId: string,
  candidateId: string
): Promise<JobCandidatePgvectorSimilarity | null> {
  const cosineSimilarity = await queryJobCandidatePgvectorCosineSimilarity(jobId, candidateId);
  if (cosineSimilarity == null) return null;
  return {
    cosineSimilarity,
    semanticScore: semanticScoreFromCosine(cosineSimilarity),
  };
}

/** Rank candidates by cosine similarity to a job's stored `embedding_vector`. */
export async function rankCandidatesByJobPgvectorSimilarity(
  jobId: string,
  options: RankByPgvectorCosineSimilarityOptions = {}
): Promise<PgvectorSimilarityRankRow[]> {
  const rows = await queryTopCandidatesByJobEmbeddingCosineSimilarity(jobId, {
    limit: options.limit,
    minCosineSimilarity: options.minCosineSimilarity,
    candidateIds: options.entityIds,
  });
  return mapSqlRowsToRanked(rows);
}

/** Rank jobs by cosine similarity to a candidate's stored `embedding_vector`. */
export async function rankJobsByCandidatePgvectorSimilarity(
  candidateId: string,
  options: RankByPgvectorCosineSimilarityOptions = {}
): Promise<PgvectorSimilarityRankRow[]> {
  const rows = await queryTopJobsByCandidateEmbeddingCosineSimilarity(candidateId, {
    limit: options.limit,
    minCosineSimilarity: options.minCosineSimilarity,
    jobIds: options.entityIds,
  });
  return mapSqlRowsToRanked(rows);
}

// Re-export SQL query layer for direct use (recruiter search, diagnostics).
export {
  PGVECTOR_COSINE_DISTANCE_OPERATOR,
  queryJobCandidatePgvectorCosineSimilarity,
  queryTopCandidatesByCosineSimilarity,
  queryTopCandidatesByJobEmbeddingCosineSimilarity,
  queryTopJobsByCandidateEmbeddingCosineSimilarity,
  queryTopJobsByCosineSimilarity,
} from "@/src/lib/pgvector-similarity-queries";
