-- Personal contact email; remove unused staff profile resume columns from user_profiles.
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "personal_email" TEXT;

ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "profile_resume_url";
ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "profile_resume_file_name";
