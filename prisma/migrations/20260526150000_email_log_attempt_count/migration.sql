-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_logs_template_created_at_idx" ON "email_logs"("template", "created_at");
