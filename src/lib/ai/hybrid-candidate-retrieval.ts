import { Prisma } from "@prisma/client";
import type { RecruiterQueryIntent } from "@/src/lib/ai/recruiter-query-intent";
import { isAdmin } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import {
  assertValidPgvectorQuery,
  toPgvectorLiteral,
} from "@/src/lib/pgvector-utils";
import { semanticScoreFromCosine } from "@/src/lib/vector-similarity";

/** Standard RRF constant (Cormack et al.). */
export const RRF_K = 60;

export type HybridRetrievalRow = {
  entityId: string;
  /** Cosine similarity in [0, 1]; null when candidate has no vector. */
  cosineSimilarity: number | null;
  /** Reciprocal rank fusion score (higher is better). */
  rrfScore: number;
  /** Same scale as elsewhere (0–100). 0 when no vector. */
  semanticScore: number;
};

export type HybridCandidateRetrievalOptions = {
  role: string | undefined;
  userId: string | undefined;
  intent: RecruiterQueryIntent;
  /** Natural-language query for FTS (`plainto_tsquery`). */
  ftsQuery: string;
  /** Max fused rows returned (default 50, max 200). */
  limit?: number;
  /** Per-channel recall depth before RRF (default 80, max 200). */
  channelLimit?: number;
  minCosineSimilarity?: number;
};

type RawHybridRow = {
  entityId: string;
  cosineSimilarity: number | string | null;
  rrfScore: number | string | null;
};

function clampLimit(n: number | undefined, def: number, max: number): number {
  return Math.max(1, Math.min(max, Math.trunc(n ?? def)));
}

function clampThreshold(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function parseFinite(value: number | string | null | undefined): number | null {
  const raw = typeof value === "string" ? Number(value) : value;
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw;
}

function buildOwnerScopeSql(
  role: string | undefined,
  userId: string | undefined
): Prisma.Sql {
  if (isAdmin(role)) return Prisma.empty;
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) {
    return Prisma.sql`AND FALSE`;
  }
  return Prisma.sql`AND c."owner_id" = ${id}`;
}

function buildHardFilterSql(intent: RecruiterQueryIntent): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  if (intent.mustHaveSkillTokens.length > 0) {
    // Postgres text[] containment: candidate must include every must-have skill.
    parts.push(
      Prisma.sql`AND c."normalized_skills" @> ARRAY[${Prisma.join(
        intent.mustHaveSkillTokens.map((t) => Prisma.sql`${t}`)
      )}]::text[]`
    );
  }

  if (
    intent.minimumExperienceYears != null &&
    Number.isFinite(intent.minimumExperienceYears)
  ) {
    const years = Math.trunc(intent.minimumExperienceYears);
    parts.push(
      Prisma.sql`AND c."total_experience" IS NOT NULL AND c."total_experience" >= ${years}`
    );
  }

  const loc = intent.locationHint?.trim();
  if (loc) {
    const pattern = `%${loc}%`;
    parts.push(
      Prisma.sql`AND c."preferred_work_location" IS NOT NULL AND c."preferred_work_location" ILIKE ${pattern}`
    );
  }

  if (parts.length === 0) return Prisma.empty;
  return Prisma.join(parts, " ");
}

/**
 * Owner-scoped hybrid retrieval: pgvector ANN + Postgres FTS → Reciprocal Rank Fusion.
 *
 * Hard filters (must-have known skills, min years, location) apply before both channels.
 */
export async function retrieveCandidatesHybridRrf(
  queryVector: readonly number[],
  options: HybridCandidateRetrievalOptions
): Promise<HybridRetrievalRow[]> {
  assertValidPgvectorQuery(queryVector);

  const limit = clampLimit(options.limit, 50, 200);
  const channelLimit = clampLimit(options.channelLimit, 80, 200);
  const queryLiteral = toPgvectorLiteral(queryVector);
  const threshold = clampThreshold(options.minCosineSimilarity);
  const ownerSql = buildOwnerScopeSql(options.role, options.userId);
  const hardSql = buildHardFilterSql(options.intent);
  const ftsText = options.ftsQuery.trim();

  const thresholdSql =
    threshold != null && threshold > 0
      ? Prisma.sql`AND (1 - (c."embedding_vector" <=> ${queryLiteral}::vector)) >= ${threshold}`
      : Prisma.empty;

  const ftsChannelSql = ftsText
    ? Prisma.sql`
      , fts_hits AS (
        SELECT
          c."id" AS id,
          ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(c."search_tsv", plainto_tsquery('english', ${ftsText})) DESC,
              c."id" ASC
          ) AS rank
        FROM scoped c
        WHERE c."search_tsv" @@ plainto_tsquery('english', ${ftsText})
        ORDER BY ts_rank_cd(c."search_tsv", plainto_tsquery('english', ${ftsText})) DESC,
          c."id" ASC
        LIMIT ${channelLimit}
      )
    `
    : Prisma.empty;

  const unionSql = ftsText
    ? Prisma.sql`
      SELECT id, rank FROM vector_hits
      UNION ALL
      SELECT id, rank FROM fts_hits
    `
    : Prisma.sql`SELECT id, rank FROM vector_hits`;

  const rows = await prisma.$queryRaw<RawHybridRow[]>`
    WITH scoped AS (
      SELECT c."id", c."embedding_vector", c."search_tsv"
      FROM "candidates" c
      WHERE TRUE
      ${ownerSql}
      ${hardSql}
    ),
    vector_hits AS (
      SELECT
        c."id" AS id,
        ROW_NUMBER() OVER (
          ORDER BY (c."embedding_vector" <=> ${queryLiteral}::vector) ASC,
            c."id" ASC
        ) AS rank
      FROM scoped c
      WHERE c."embedding_vector" IS NOT NULL
      ${thresholdSql}
      ORDER BY (c."embedding_vector" <=> ${queryLiteral}::vector) ASC,
        c."id" ASC
      LIMIT ${channelLimit}
    )
    ${ftsChannelSql}
    , fused AS (
      SELECT
        u.id,
        SUM(1.0 / (${RRF_K} + u.rank))::double precision AS rrf_score
      FROM (
        ${unionSql}
      ) u
      GROUP BY u.id
    )
    SELECT
      f.id AS "entityId",
      CASE
        WHEN c."embedding_vector" IS NULL THEN NULL
        ELSE (1 - (c."embedding_vector" <=> ${queryLiteral}::vector))
      END AS "cosineSimilarity",
      f.rrf_score AS "rrfScore"
    FROM fused f
    INNER JOIN "candidates" c ON c."id" = f.id
    ORDER BY f.rrf_score DESC, f.id ASC
    LIMIT ${limit}
  `;

  const out: HybridRetrievalRow[] = [];
  for (const row of rows) {
    const cosine = parseFinite(row.cosineSimilarity);
    const rrf = parseFinite(row.rrfScore) ?? 0;
    const cosineClamped =
      cosine == null ? null : Math.min(1, Math.max(0, cosine));
    out.push({
      entityId: row.entityId,
      cosineSimilarity: cosineClamped,
      rrfScore: rrf,
      semanticScore:
        cosineClamped == null ? 0 : semanticScoreFromCosine(cosineClamped),
    });
  }
  return out;
}
