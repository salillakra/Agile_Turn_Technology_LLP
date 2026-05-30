-- Interview audit columns on activity_logs (indexed; no FK so environments without `interviews` still apply).
ALTER TABLE "activity_logs" ADD COLUMN "interview_id" TEXT;
ALTER TABLE "activity_logs" ADD COLUMN "interviewer_id" TEXT;

CREATE INDEX "activity_logs_interview_id_idx" ON "activity_logs"("interview_id");
CREATE INDEX "activity_logs_interviewer_id_idx" ON "activity_logs"("interviewer_id");
