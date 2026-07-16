-- Hybrid resume parse: PARTIAL status, strategy audit fields, parsed_resumes table.

CREATE TYPE "ResumeParseStrategy" AS ENUM ('RULE_BASED', 'LLM', 'HYBRID');

ALTER TYPE "ResumeParseJobStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TABLE "resume_parse_jobs"
  ADD COLUMN IF NOT EXISTS "llm_retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "strategy_used" "ResumeParseStrategy",
  ADD COLUMN IF NOT EXISTS "rule_confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "llm_confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "disagreement_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "parsed_resumes" (
  "id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "resume_parse_job_id" TEXT NOT NULL,
  "strategy" "ResumeParseStrategy" NOT NULL,
  "payload" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parsed_resumes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "parsed_resumes_candidate_id_idx" ON "parsed_resumes"("candidate_id");
CREATE INDEX IF NOT EXISTS "parsed_resumes_resume_parse_job_id_idx" ON "parsed_resumes"("resume_parse_job_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parsed_resumes_candidate_id_fkey'
  ) THEN
    ALTER TABLE "parsed_resumes"
      ADD CONSTRAINT "parsed_resumes_candidate_id_fkey"
      FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parsed_resumes_resume_parse_job_id_fkey'
  ) THEN
    ALTER TABLE "parsed_resumes"
      ADD CONSTRAINT "parsed_resumes_resume_parse_job_id_fkey"
      FOREIGN KEY ("resume_parse_job_id") REFERENCES "resume_parse_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
