import { extractEmbeddingVector } from "@/src/lib/vector-similarity";
import { prisma } from "@/src/lib/prisma";

type EmbeddingEntityType = "job" | "candidate";

async function hasPgvectorEmbedding(
  entityType: EmbeddingEntityType,
  entityId: string
): Promise<boolean> {
  const rows =
    entityType === "job"
      ? await prisma.$queryRaw<{ has_vector: boolean }[]>`
          SELECT ("embedding_vector" IS NOT NULL) AS "has_vector"
          FROM "jobs"
          WHERE "id" = ${entityId}
        `
      : await prisma.$queryRaw<{ has_vector: boolean }[]>`
          SELECT ("embedding_vector" IS NOT NULL) AS "has_vector"
          FROM "candidates"
          WHERE "id" = ${entityId}
        `;
  return rows[0]?.has_vector === true;
}

/**
 * True when both JSON `embedding.vector` and `embedding_vector` pgvector column are set.
 */
export async function entityEmbeddingFullyStored(
  entityType: EmbeddingEntityType,
  entityId: string,
  storedJson: unknown
): Promise<boolean> {
  if (extractEmbeddingVector(storedJson) == null) {
    return false;
  }
  try {
    return await hasPgvectorEmbedding(entityType, entityId);
  } catch {
    return extractEmbeddingVector(storedJson) != null;
  }
}
