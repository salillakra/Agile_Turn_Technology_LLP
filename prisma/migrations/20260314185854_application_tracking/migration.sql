/*
  Warnings:

  - The values [Applied,Screening,Interview,Technical,Final_Round,Offer_Sent,Hired,Rejected] on the enum `ApplicationStage` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `skill` on the `candidate_skills` table. All the data in the column will be lost.
  - Added the required column `skill_name` to the `candidate_skills` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApplicationStage_new" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'TECHNICAL', 'FINAL_ROUND', 'OFFER_SENT', 'HIRED', 'REJECTED');
ALTER TABLE "applications" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "applications" ALTER COLUMN "stage" TYPE "ApplicationStage_new" USING ("stage"::text::"ApplicationStage_new");
ALTER TYPE "ApplicationStage" RENAME TO "ApplicationStage_old";
ALTER TYPE "ApplicationStage_new" RENAME TO "ApplicationStage";
DROP TYPE "ApplicationStage_old";
ALTER TABLE "applications" ALTER COLUMN "stage" SET DEFAULT 'APPLIED';
COMMIT;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "interview_date" TIMESTAMP(3),
ALTER COLUMN "stage" SET DEFAULT 'APPLIED';

-- AlterTable
ALTER TABLE "candidate_skills" DROP COLUMN "skill",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "skill_name" VARCHAR(200) NOT NULL;

-- CreateTable
CREATE TABLE "candidate_notes" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
