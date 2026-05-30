-- Repair: migration 20260525120000 was recorded applied but embedding_jobs may be missing.

DO $$ BEGIN
  CREATE TYPE "EmbeddingJobEntityType" AS ENUM ('JOB', 'CANDIDATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmbeddingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "embedding_jobs" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "embedding_jobs_entity_type_entity_id_key"
  ON "embedding_jobs"("entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "embedding_jobs_status_idx" ON "embedding_jobs"("status");
