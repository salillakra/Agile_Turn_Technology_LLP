-- CreateEnum (idempotent: PostgreSQL commits CREATE TYPE before ALTER; a failed run can leave the enum behind)
DO $create_enum$
BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('CANDIDATE_CREATED', 'APPLICATION_CREATED', 'STAGE_CHANGED', 'INTERVIEW_SCHEDULED', 'OFFER_SENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$create_enum$;

-- AlterTable only if `type` is still text (not already converted to the enum)
DO $alter_col$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'notifications'
      AND c.column_name = 'type'
      AND c.udt_name = 'text'
  ) THEN
    ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType" USING (
      CASE "type"
        WHEN 'CANDIDATE_ADDED' THEN 'CANDIDATE_CREATED'::"NotificationType"
        WHEN 'CANDIDATE_CREATED' THEN 'CANDIDATE_CREATED'::"NotificationType"
        WHEN 'APPLICATION_CREATED' THEN 'APPLICATION_CREATED'::"NotificationType"
        WHEN 'APPLICATION_STAGE_CHANGED' THEN 'STAGE_CHANGED'::"NotificationType"
        WHEN 'STAGE_CHANGED' THEN 'STAGE_CHANGED'::"NotificationType"
        WHEN 'APPLICATION_STAGE_INTERVIEW' THEN 'INTERVIEW_SCHEDULED'::"NotificationType"
        WHEN 'APPLICATION_INTERVIEW_ASSIGNED' THEN 'INTERVIEW_SCHEDULED'::"NotificationType"
        WHEN 'INTERVIEW_SCHEDULED' THEN 'INTERVIEW_SCHEDULED'::"NotificationType"
        WHEN 'OFFER_SENT' THEN 'OFFER_SENT'::"NotificationType"
        ELSE 'APPLICATION_CREATED'::"NotificationType"
      END
    );
  END IF;
END
$alter_col$;
