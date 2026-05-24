-- CreateEnum
CREATE TYPE "ResumeParseJobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "resume_parse_jobs" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "status" "ResumeParseJobStatus" NOT NULL DEFAULT 'PENDING',
    "file_hash" TEXT NOT NULL,
    "result_json" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_parse_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_parse_jobs_candidate_id_idx" ON "resume_parse_jobs"("candidate_id");

-- CreateIndex
CREATE INDEX "resume_parse_jobs_status_idx" ON "resume_parse_jobs"("status");

-- AddForeignKey
ALTER TABLE "resume_parse_jobs" ADD CONSTRAINT "resume_parse_jobs_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
