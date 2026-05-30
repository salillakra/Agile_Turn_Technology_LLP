/** Shape persisted on `Job.embedding` / `Candidate.embedding` after AI sync. */
export type StoredEmbeddingRecord = {
  model?: string;
  vector?: unknown;
  semanticText?: string;
};

const MIN_VECTOR_LENGTH = 1;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Parse a stored JSON embedding column into a numeric vector. */
export function extractEmbeddingVector(stored: unknown): number[] | null {
  if (stored == null || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }

  const record = stored as StoredEmbeddingRecord;
  if (!Array.isArray(record.vector)) {
    return null;
  }

  const vector = record.vector.filter(isFiniteNumber);
  return vector.length >= MIN_VECTOR_LENGTH ? vector : null;
}

function assertSameLength(a: readonly number[], b: readonly number[]): void {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding length mismatch: ${a.length} vs ${b.length}`
    );
  }
  if (a.length < MIN_VECTOR_LENGTH) {
    throw new Error("Embeddings must be non-empty");
  }
}

/**
 * Cosine similarity between two vectors.
 * Result is clamped to [0, 1] for stored L2-normalized embeddings (e.g. all-MiniLM-L6-v2).
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[]
): number {
  assertSameLength(a, b);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.min(1, Math.max(0, score));
}

/**
 * Compare two embedding vectors and return cosine similarity in [0, 1].
 * Accepts raw vectors or persisted `{ vector: number[] }` records.
 */
export function compareEmbeddings(
  left: readonly number[] | StoredEmbeddingRecord | unknown,
  right: readonly number[] | StoredEmbeddingRecord | unknown
): number {
  const vectorA = Array.isArray(left) ? left.filter(isFiniteNumber) : extractEmbeddingVector(left);
  const vectorB = Array.isArray(right) ? right.filter(isFiniteNumber) : extractEmbeddingVector(right);

  if (!vectorA || !vectorB) {
    throw new Error("Invalid embedding: expected number[] or stored embedding record with vector");
  }

  return cosineSimilarity(vectorA, vectorB);
}

/** pgvector cosine distance `<=>` → similarity in [0, 1] (unit-normalized embeddings). */
export function cosineSimilarityFromPgvectorDistance(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return Math.min(1, Math.max(0, 1 - distance));
}

/** Map cosine similarity in [0, 1] to semantic score percent (0–100, one decimal). */
export function semanticScoreFromCosine(cosine: number): number {
  return Math.round(Math.min(1, Math.max(0, cosine)) * 1000) / 10;
}
