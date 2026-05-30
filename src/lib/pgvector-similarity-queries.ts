import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import {
  assertValidPgvectorQuery,
  toPgvectorLiteral,
} from "@/src/lib/pgvector-utils";

/**
 * pgvector cosine distance operator (`vector_cosine_ops`).
 * Cosine similarity = `1 - (embedding_vector <=> query_vector)`.
 */
export const PGVECTOR_COSINE_DISTANCE_OPERATOR = "<=>" as const;

export type PgvectorCosineSimilaritySqlRow = {
  entityId: string;
  cosineSimilarity: number | string | null;
};

export type TopCandidatesByCosineSimilarityOptions = {
  /** Max rows (top-N). Default 50, max 500. */
  limit?: number;
  /** Minimum cosine similarity in [0, 1]. Rows below threshold are excluded. */
  minCosineSimilarity?: number;
  /** Restrict to these candidate ids (optional). */
  candidateIds?: readonly string[];
};

export type TopJobsByCosineSimilarityOptions = {
  limit?: number;
  minCosineSimilarity?: number;
  jobIds?: readonly string[];
};

function clampLimit(limit: number | undefined, defaultLimit = 50): number {
  return Math.max(1, Math.min(limit ?? defaultLimit, 500));
}

function clampThreshold(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function buildCandidateIdFilter(candidateIds: readonly string[] | undefined): Prisma.Sql {
  if (!candidateIds?.length) return Prisma.empty;
  return Prisma.sql`AND c."id" IN (${Prisma.join(
    candidateIds.map((id) => Prisma.sql`${id}`)
  )})`;
}

function buildJobIdFilter(jobIds: readonly string[] | undefined): Prisma.Sql {
  if (!jobIds?.length) return Prisma.empty;
  return Prisma.sql`AND j."id" IN (${Prisma.join(
    jobIds.map((id) => Prisma.sql`${id}`)
  )})`;
}

function buildEntityIdFilter(
  tableAlias: "" | "c" | "j",
  entityIds: readonly string[] | undefined
): Prisma.Sql {
  if (!entityIds?.length) return Prisma.empty;
  const col = tableAlias ? Prisma.raw(`${tableAlias}."id"`) : Prisma.raw(`"id"`);
  return Prisma.sql`AND ${col} IN (${Prisma.join(entityIds.map((id) => Prisma.sql`${id}`))})`;
}

function buildThresholdFilter(
  vectorExpr: Prisma.Sql,
  queryLiteral: string,
  minCosineSimilarity: number | undefined
): Prisma.Sql {
  const threshold = clampThreshold(minCosineSimilarity);
  if (threshold == null || threshold <= 0) return Prisma.empty;
  return Prisma.sql`AND (1 - (${vectorExpr} <=> ${queryLiteral}::vector)) >= ${threshold}`;
}

function buildThresholdFilterVectorToVector(
  leftExpr: Prisma.Sql,
  rightExpr: Prisma.Sql,
  minCosineSimilarity: number | undefined
): Prisma.Sql {
  const threshold = clampThreshold(minCosineSimilarity);
  if (threshold == null || threshold <= 0) return Prisma.empty;
  return Prisma.sql`AND (1 - (${leftExpr} <=> ${rightExpr})) >= ${threshold}`;
}

/**
 * Top-N candidates by cosine similarity to a query embedding.
 *
 * SQL shape:
 * - Similarity: `(1 - (embedding_vector <=> query::vector))`
 * - Filter: `embedding_vector IS NOT NULL` + optional threshold + optional id list
 * - Sort: similarity DESC
 * - Limit: top-N
 */
export async function queryTopCandidatesByCosineSimilarity(
  queryVector: readonly number[],
  options: TopCandidatesByCosineSimilarityOptions = {}
): Promise<PgvectorCosineSimilaritySqlRow[]> {
  assertValidPgvectorQuery(queryVector);

  const queryLiteral = toPgvectorLiteral(queryVector);
  const limit = clampLimit(options.limit);
  const vectorCol = Prisma.raw(`"embedding_vector"`);
  const idFilter = buildEntityIdFilter("", options.candidateIds);
  const thresholdFilter = buildThresholdFilter(vectorCol, queryLiteral, options.minCosineSimilarity);

  return prisma.$queryRaw<PgvectorCosineSimilaritySqlRow[]>`
    SELECT
      "id" AS "entityId",
      (1 - ("embedding_vector" <=> ${queryLiteral}::vector)) AS "cosineSimilarity"
    FROM "candidates"
    WHERE "embedding_vector" IS NOT NULL
    ${idFilter}
    ${thresholdFilter}
    ORDER BY (1 - ("embedding_vector" <=> ${queryLiteral}::vector)) DESC
    LIMIT ${limit}
  `;
}

/**
 * Top-N jobs by cosine similarity to a query embedding.
 */
export async function queryTopJobsByCosineSimilarity(
  queryVector: readonly number[],
  options: TopJobsByCosineSimilarityOptions = {}
): Promise<PgvectorCosineSimilaritySqlRow[]> {
  assertValidPgvectorQuery(queryVector);

  const queryLiteral = toPgvectorLiteral(queryVector);
  const limit = clampLimit(options.limit);
  const vectorCol = Prisma.raw(`"embedding_vector"`);
  const idFilter = buildEntityIdFilter("", options.jobIds);
  const thresholdFilter = buildThresholdFilter(vectorCol, queryLiteral, options.minCosineSimilarity);

  return prisma.$queryRaw<PgvectorCosineSimilaritySqlRow[]>`
    SELECT
      "id" AS "entityId",
      (1 - ("embedding_vector" <=> ${queryLiteral}::vector)) AS "cosineSimilarity"
    FROM "jobs"
    WHERE "embedding_vector" IS NOT NULL
    ${idFilter}
    ${thresholdFilter}
    ORDER BY (1 - ("embedding_vector" <=> ${queryLiteral}::vector)) DESC
    LIMIT ${limit}
  `;
}

/**
 * Pairwise job↔candidate cosine similarity from stored `embedding_vector` columns.
 * Returns null when either vector is missing.
 */
export async function queryJobCandidatePgvectorCosineSimilarity(
  jobId: string,
  candidateId: string
): Promise<number | null> {
  const job = jobId.trim();
  const candidate = candidateId.trim();
  if (!job || !candidate) return null;

  const rows = await prisma.$queryRaw<Array<{ cosineSimilarity: number | string | null }>>`
    SELECT (1 - (c."embedding_vector" <=> j."embedding_vector")) AS "cosineSimilarity"
    FROM "candidates" c
    INNER JOIN "jobs" j ON j."id" = ${job}
    WHERE c."id" = ${candidate}
      AND c."embedding_vector" IS NOT NULL
      AND j."embedding_vector" IS NOT NULL
    LIMIT 1
  `;

  const raw = rows[0]?.cosineSimilarity;
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  if (parsed == null || !Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
}

/**
 * Top-N candidates ranked by cosine similarity to a job's stored embedding (no query vector in app memory).
 */
export async function queryTopCandidatesByJobEmbeddingCosineSimilarity(
  jobId: string,
  options: TopCandidatesByCosineSimilarityOptions = {}
): Promise<PgvectorCosineSimilaritySqlRow[]> {
  const id = jobId.trim();
  if (!id) return [];

  const limit = clampLimit(options.limit);
  const idFilter = buildCandidateIdFilter(options.candidateIds);
  const thresholdFilter = buildThresholdFilterVectorToVector(
    Prisma.raw(`c."embedding_vector"`),
    Prisma.raw(`j."embedding_vector"`),
    options.minCosineSimilarity
  );

  return prisma.$queryRaw<PgvectorCosineSimilaritySqlRow[]>`
    SELECT
      c."id" AS "entityId",
      (1 - (c."embedding_vector" <=> j."embedding_vector")) AS "cosineSimilarity"
    FROM "candidates" c
    INNER JOIN "jobs" j ON j."id" = ${id}
    WHERE c."embedding_vector" IS NOT NULL
      AND j."embedding_vector" IS NOT NULL
    ${idFilter}
    ${thresholdFilter}
    ORDER BY (1 - (c."embedding_vector" <=> j."embedding_vector")) DESC
    LIMIT ${limit}
  `;
}

/**
 * Top-N jobs ranked by cosine similarity to a candidate's stored embedding.
 */
export async function queryTopJobsByCandidateEmbeddingCosineSimilarity(
  candidateId: string,
  options: TopJobsByCosineSimilarityOptions = {}
): Promise<PgvectorCosineSimilaritySqlRow[]> {
  const id = candidateId.trim();
  if (!id) return [];

  const limit = clampLimit(options.limit);
  const idFilter = buildJobIdFilter(options.jobIds);
  const thresholdFilter = buildThresholdFilterVectorToVector(
    Prisma.raw(`j."embedding_vector"`),
    Prisma.raw(`c."embedding_vector"`),
    options.minCosineSimilarity
  );

  return prisma.$queryRaw<PgvectorCosineSimilaritySqlRow[]>`
    SELECT
      j."id" AS "entityId",
      (1 - (j."embedding_vector" <=> c."embedding_vector")) AS "cosineSimilarity"
    FROM "jobs" j
    INNER JOIN "candidates" c ON c."id" = ${id}
    WHERE j."embedding_vector" IS NOT NULL
      AND c."embedding_vector" IS NOT NULL
    ${idFilter}
    ${thresholdFilter}
    ORDER BY (1 - (j."embedding_vector" <=> c."embedding_vector")) DESC
    LIMIT ${limit}
  `;
}
