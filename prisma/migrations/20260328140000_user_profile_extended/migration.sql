-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN "company_name" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "skills" JSONB;
ALTER TABLE "user_profiles" ADD COLUMN "experience" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "education" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "linkedin_url" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "github_url" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "portfolio_url" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "profile_resume_url" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "profile_resume_file_name" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "avatar_file_name" TEXT;
