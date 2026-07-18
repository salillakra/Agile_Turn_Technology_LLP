-- Tier-1 recruiter search: HNSW ANN indexes + full-text search document for hybrid RRF.

-- HNSW (cosine) for ANN retrieval — replaces dropped IVFFlat indexes.
CREATE INDEX IF NOT EXISTS "candidates_embedding_vector_hnsw_cos_idx"
ON "candidates" USING hnsw ("embedding_vector" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "jobs_embedding_vector_hnsw_cos_idx"
ON "jobs" USING hnsw ("embedding_vector" vector_cosine_ops);

-- Lexical search document (trigger-maintained; generated columns reject to_tsvector as non-immutable).
ALTER TABLE "candidates"
ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;

CREATE OR REPLACE FUNCTION candidates_search_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW."search_tsv" :=
    setweight(to_tsvector('english', coalesce(NEW."candidate_name", '')), 'A')
    || setweight(to_tsvector('english', coalesce(NEW."current_designation", '')), 'A')
    || setweight(to_tsvector('english', coalesce(array_to_string(NEW."skills", ' '), '')), 'A')
    || setweight(to_tsvector('english', coalesce(array_to_string(NEW."normalized_skills", ' '), '')), 'A')
    || setweight(to_tsvector('english', coalesce(NEW."summary", '')), 'B')
    || setweight(to_tsvector('english', coalesce(NEW."current_company", '')), 'B')
    || setweight(to_tsvector('english', coalesce(NEW."preferred_work_location", '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS candidates_search_tsv_trg ON "candidates";
CREATE TRIGGER candidates_search_tsv_trg
BEFORE INSERT OR UPDATE OF
  "candidate_name",
  "current_designation",
  "skills",
  "normalized_skills",
  "summary",
  "current_company",
  "preferred_work_location"
ON "candidates"
FOR EACH ROW
EXECUTE FUNCTION candidates_search_tsv_update();

-- Backfill existing rows
UPDATE "candidates" SET "candidate_name" = "candidate_name";

CREATE INDEX IF NOT EXISTS "candidates_search_tsv_gin_idx"
ON "candidates" USING gin ("search_tsv");

ANALYZE "candidates";
ANALYZE "jobs";
