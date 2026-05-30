import { prisma } from "@/src/lib/prisma";

/** Dimension of `jobs.embedding_vector` / `candidates.embedding_vector` (all-MiniLM-L6-v2). */
export const PGVECTOR_EMBEDDING_DIMENSION = 384;

/** Cached result of pgvector availability check (reset on process restart). */
let _pgvectorAvailable: boolean | null = null;

/**
 * Returns true when the `vector` extension is installed in the connected database.
 * Result is cached for the lifetime of the process.
 */
export async function isPgvectorAvailable(): Promise<boolean> {
  if (_pgvectorAvailable !== null) return _pgvectorAvailable;
  try {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    _pgvectorAvailable = rows.length > 0;
  } catch {
    _pgvectorAvailable = false;
  }
  return _pgvectorAvailable;
}

/**
 * Format a numeric embedding array for PostgreSQL `::vector` cast.
 * Input must come from trusted embed pipeline (not raw user text).
 */
export function toPgvectorLiteral(vector: readonly number[]): string {
  const safe = vector
    .map((n) => (typeof n === "number" && Number.isFinite(n) ? String(n) : "0"))
    .join(", ");
  return `[${safe}]`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validate query vector length and numeric values before pgvector SQL. */
export function assertValidPgvectorQuery(
  vector: readonly number[],
  expectedDimension: number = PGVECTOR_EMBEDDING_DIMENSION
): void {
  if (vector.length !== expectedDimension) {
    throw new Error(
      `Query embedding length ${vector.length} does not match pgvector dimension ${expectedDimension}`
    );
  }
  if (!vector.every(isFiniteNumber)) {
    throw new Error("Query embedding must contain only finite numbers");
  }
}
