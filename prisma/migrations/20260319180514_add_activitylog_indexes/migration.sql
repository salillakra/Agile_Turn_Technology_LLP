-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "withdrawn_at" TIMESTAMP(3),
ADD COLUMN     "withdrawn_reason" TEXT;

-- CreateIndex
CREATE INDEX "activity_logs_application_id_idx" ON "activity_logs"("application_id");

-- CreateIndex
CREATE INDEX "activity_logs_application_id_createdAt_idx" ON "activity_logs"("application_id", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "applications_candidate_id_idx" ON "applications"("candidate_id");

-- CreateIndex
CREATE INDEX "applications_job_id_idx" ON "applications"("job_id");

-- CreateIndex
CREATE INDEX "applications_stage_idx" ON "applications"("stage");

-- CreateIndex
CREATE INDEX "applications_applied_date_idx" ON "applications"("applied_date");

-- CreateIndex
CREATE INDEX "applications_job_id_stage_idx" ON "applications"("job_id", "stage");

-- CreateIndex
CREATE INDEX "applications_withdrawn_at_idx" ON "applications"("withdrawn_at");
