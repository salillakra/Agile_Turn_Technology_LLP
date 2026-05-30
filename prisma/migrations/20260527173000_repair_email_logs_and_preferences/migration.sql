-- Repair: email_logs / email_preferences migrations may be marked applied but tables missing.

DO $$ BEGIN
  CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "email_logs" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "message_id" TEXT,
    "bullmq_job_id" TEXT,
    "application_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_logs_bullmq_job_id_key" ON "email_logs"("bullmq_job_id");
CREATE INDEX IF NOT EXISTS "email_logs_recipient_idx" ON "email_logs"("recipient");
CREATE INDEX IF NOT EXISTS "email_logs_status_idx" ON "email_logs"("status");
CREATE INDEX IF NOT EXISTS "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");
CREATE INDEX IF NOT EXISTS "email_logs_created_at_idx" ON "email_logs"("created_at");
CREATE INDEX IF NOT EXISTS "email_logs_template_created_at_idx" ON "email_logs"("template", "created_at");

ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "email_preferences" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT,
    "candidate_id" TEXT,
    "stage_updates" BOOLEAN NOT NULL DEFAULT true,
    "interview_reminders" BOOLEAN NOT NULL DEFAULT true,
    "marketing_emails" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_preferences_email_key" ON "email_preferences"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "email_preferences_user_id_key" ON "email_preferences"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "email_preferences_candidate_id_key" ON "email_preferences"("candidate_id");

DO $$ BEGIN
  ALTER TABLE "email_preferences"
    ADD CONSTRAINT "email_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "email_preferences"
    ADD CONSTRAINT "email_preferences_candidate_id_fkey"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
