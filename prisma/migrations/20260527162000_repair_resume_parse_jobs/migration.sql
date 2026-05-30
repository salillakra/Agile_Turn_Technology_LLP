-- Repair: 20260525120000 was recorded applied but resume_parse_jobs enum/columns were not updated.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ResumeParseJobStatus'
      AND e.enumlabel = 'DONE'
  ) THEN
    CREATE TYPE "ResumeParseJobStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

    ALTER TABLE "resume_parse_jobs" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "resume_parse_jobs" ALTER COLUMN "status" TYPE "ResumeParseJobStatus_new" USING (
      CASE "status"::text
        WHEN 'DONE' THEN 'COMPLETED'::"ResumeParseJobStatus_new"
        WHEN 'PENDING' THEN 'PENDING'::"ResumeParseJobStatus_new"
        WHEN 'FAILED' THEN 'FAILED'::"ResumeParseJobStatus_new"
        WHEN 'PROCESSING' THEN 'PROCESSING'::"ResumeParseJobStatus_new"
        WHEN 'COMPLETED' THEN 'COMPLETED'::"ResumeParseJobStatus_new"
        ELSE 'PENDING'::"ResumeParseJobStatus_new"
      END
    );
    ALTER TABLE "resume_parse_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING';

    DROP TYPE "ResumeParseJobStatus";
    ALTER TYPE "ResumeParseJobStatus_new" RENAME TO "ResumeParseJobStatus";
  END IF;
END $$;

ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "bullmq_job_id" TEXT;
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "resume_parse_jobs" ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);
