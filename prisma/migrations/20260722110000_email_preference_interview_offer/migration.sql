-- Expand email preference channels for interview lifecycle + offer letters.
ALTER TABLE "email_preferences" ADD COLUMN IF NOT EXISTS "interview_emails" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "email_preferences" ADD COLUMN IF NOT EXISTS "offer_emails" BOOLEAN NOT NULL DEFAULT true;
