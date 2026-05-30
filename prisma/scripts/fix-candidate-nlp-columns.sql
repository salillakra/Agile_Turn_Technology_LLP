-- Adds candidate NLP profile columns if missing (migration 20260526160000).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "companies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "education" JSONB;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
