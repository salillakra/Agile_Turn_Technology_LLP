/*
  Warnings:

  - You are about to drop the column `createdAt` on the `candidates` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('LINKEDIN', 'INDEED', 'REFERRAL', 'COMPANY_WEBSITE', 'GLASSDOOR', 'HEADHUNTER', 'OTHER');

-- AlterTable
ALTER TABLE "candidates" DROP COLUMN "createdAt",
ADD COLUMN     "candidate_source" "CandidateSource",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "current_company" TEXT,
ADD COLUMN     "current_ctc" DECIMAL(12,2),
ADD COLUMN     "current_designation" TEXT,
ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "expected_ctc" DECIMAL(12,2),
ADD COLUMN     "last_working_day" TIMESTAMP(3),
ADD COLUMN     "notice_period" TEXT,
ADD COLUMN     "offer_in_hand" BOOLEAN,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "position_role" TEXT,
ADD COLUMN     "preferred_work_location" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "relevant_experience" INTEGER,
ADD COLUMN     "resume_url" TEXT,
ADD COLUMN     "total_experience" INTEGER,
ADD COLUMN     "vendor" TEXT;

-- CreateTable
CREATE TABLE "candidate_skills" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "skill" VARCHAR(200) NOT NULL,

    CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
