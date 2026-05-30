-- ResumeParseJobStatus: PENDING | PROCESSING | COMPLETED | FAILED (replaces DONE)
CREATE TYPE "ResumeParseJobStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "resume_parse_jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "resume_parse_jobs" ALTER COLUMN "status" TYPE "ResumeParseJobStatus_new" USING (
  CASE "status"::text
    WHEN 'DONE' THEN 'COMPLETED'::"ResumeParseJobStatus_new"
    WHEN 'PENDING' THEN 'PENDING'::"ResumeParseJobStatus_new"
    WHEN 'FAILED' THEN 'FAILED'::"ResumeParseJobStatus_new"
    ELSE 'PENDING'::"ResumeParseJobStatus_new"
  END
);
ALTER TABLE "resume_parse_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "ResumeParseJobStatus";
ALTER TYPE "ResumeParseJobStatus_new" RENAME TO "ResumeParseJobStatus";

ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "bullmq_job_id" TEXT;
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);

CREATE TYPE "EmbeddingJobEntityType" AS ENUM ('JOB', 'CANDIDATE');
CREATE TYPE "EmbeddingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "embedding_jobs" (
    "id" TEXT NOT NULL,
    "entity_type" "EmbeddingJobEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" "EmbeddingJobStatus" NOT NULL DEFAULT 'PENDING',
    "bullmq_job_id" TEXT,
    "error" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embedding_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "embedding_jobs_entity_type_entity_id_key" ON "embedding_jobs"("entity_type", "entity_id");
CREATE INDEX "embedding_jobs_status_idx" ON "embedding_jobs"("status");
