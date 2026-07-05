/*
  Warnings:

  - You are about to drop the column `createdAt` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `candidate_tags` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `candidates` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `notes` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `notes` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `tags` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `applications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `candidate_notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `candidate_skills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `candidate_tags` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `candidates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `crm_closures` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `crm_submissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `job_assignments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `tags` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "candidates_embedding_vector_ivfflat_cos_idx";

-- DropIndex
DROP INDEX "jobs_embedding_vector_ivfflat_cos_idx";

-- AlterTable
ALTER TABLE "applications" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "candidate_notes" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "candidate_skills" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "candidate_tags" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "candidates" DROP COLUMN "updatedAt",
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_clients" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_closures" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_invoices" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_requirements" ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "crm_submissions" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "interview_interviewers" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "job_assignments" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "notes" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "tags" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "updated_by_id" TEXT;

-- CreateIndex
CREATE INDEX "applications_created_by_id_idx" ON "applications"("created_by_id");

-- CreateIndex
CREATE INDEX "applications_updated_by_id_idx" ON "applications"("updated_by_id");

-- CreateIndex
CREATE INDEX "candidate_notes_updated_by_id_idx" ON "candidate_notes"("updated_by_id");

-- CreateIndex
CREATE INDEX "candidate_skills_created_by_id_idx" ON "candidate_skills"("created_by_id");

-- CreateIndex
CREATE INDEX "candidate_skills_updated_by_id_idx" ON "candidate_skills"("updated_by_id");

-- CreateIndex
CREATE INDEX "candidate_tags_created_by_id_idx" ON "candidate_tags"("created_by_id");

-- CreateIndex
CREATE INDEX "candidate_tags_updated_by_id_idx" ON "candidate_tags"("updated_by_id");

-- CreateIndex
CREATE INDEX "candidates_created_by_id_idx" ON "candidates"("created_by_id");

-- CreateIndex
CREATE INDEX "candidates_updated_by_id_idx" ON "candidates"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_clients_created_by_id_idx" ON "crm_clients"("created_by_id");

-- CreateIndex
CREATE INDEX "crm_clients_updated_by_id_idx" ON "crm_clients"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_closures_created_by_id_idx" ON "crm_closures"("created_by_id");

-- CreateIndex
CREATE INDEX "crm_closures_updated_by_id_idx" ON "crm_closures"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_contacts_created_by_id_idx" ON "crm_contacts"("created_by_id");

-- CreateIndex
CREATE INDEX "crm_contacts_updated_by_id_idx" ON "crm_contacts"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_invoices_created_by_id_idx" ON "crm_invoices"("created_by_id");

-- CreateIndex
CREATE INDEX "crm_invoices_updated_by_id_idx" ON "crm_invoices"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_leads_created_by_id_idx" ON "crm_leads"("created_by_id");

-- CreateIndex
CREATE INDEX "crm_leads_updated_by_id_idx" ON "crm_leads"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_requirements_updated_by_id_idx" ON "crm_requirements"("updated_by_id");

-- CreateIndex
CREATE INDEX "crm_submissions_created_by_id_idx" ON "crm_submissions"("created_by_id");

-- CreateIndex
CREATE INDEX "crm_submissions_updated_by_id_idx" ON "crm_submissions"("updated_by_id");

-- CreateIndex
CREATE INDEX "interview_interviewers_created_by_id_idx" ON "interview_interviewers"("created_by_id");

-- CreateIndex
CREATE INDEX "interview_interviewers_updated_by_id_idx" ON "interview_interviewers"("updated_by_id");

-- CreateIndex
CREATE INDEX "interviews_updated_by_id_idx" ON "interviews"("updated_by_id");

-- CreateIndex
CREATE INDEX "job_assignments_assigned_by_idx" ON "job_assignments"("assigned_by");

-- CreateIndex
CREATE INDEX "job_assignments_updated_by_id_idx" ON "job_assignments"("updated_by_id");

-- CreateIndex
CREATE INDEX "jobs_updated_by_id_idx" ON "jobs"("updated_by_id");

-- CreateIndex
CREATE INDEX "notes_updated_by_id_idx" ON "notes"("updated_by_id");

-- CreateIndex
CREATE INDEX "tags_created_by_id_idx" ON "tags"("created_by_id");

-- CreateIndex
CREATE INDEX "tags_updated_by_id_idx" ON "tags"("updated_by_id");

-- CreateIndex
CREATE INDEX "user_profiles_created_by_id_idx" ON "user_profiles"("created_by_id");

-- CreateIndex
CREATE INDEX "user_profiles_updated_by_id_idx" ON "user_profiles"("updated_by_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_clients" ADD CONSTRAINT "crm_clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_clients" ADD CONSTRAINT "crm_clients_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_requirements" ADD CONSTRAINT "crm_requirements_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_submissions" ADD CONSTRAINT "crm_submissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_submissions" ADD CONSTRAINT "crm_submissions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_closures" ADD CONSTRAINT "crm_closures_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_closures" ADD CONSTRAINT "crm_closures_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
