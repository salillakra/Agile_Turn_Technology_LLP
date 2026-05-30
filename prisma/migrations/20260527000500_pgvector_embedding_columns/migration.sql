-- Add pgvector embedding columns for cosine similarity search.
-- Dimension: 384 (matches default embedding model `all-MiniLM-L6-v2`).

ALTER TABLE "candidates"
ADD COLUMN IF NOT EXISTS "embedding_vector" vector(384);

ALTER TABLE "jobs"
ADD COLUMN IF NOT EXISTS "embedding_vector" vector(384);

-- ivfflat index for cosine distance (requires pgvector).
-- Note: ivfflat requires ANALYZE for good recall; also requires `SET ivfflat.probes` at query time.
CREATE INDEX IF NOT EXISTS "candidates_embedding_vector_ivfflat_cos_idx"
ON "candidates" USING ivfflat ("embedding_vector" vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "jobs_embedding_vector_ivfflat_cos_idx"
ON "jobs" USING ivfflat ("embedding_vector" vector_cosine_ops) WITH (lists = 100);

ANALYZE "candidates";
ANALYZE "jobs";

