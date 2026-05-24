/*
  Warnings:

  - The values [Open,Paused,Closed] on the enum `JobStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `createdAt` on the `jobs` table. All the data in the column will be lost.
  - You are about to drop the column `openings` on the `jobs` table. All the data in the column will be lost.
  - You are about to drop the column `postedDate` on the `jobs` table. All the data in the column will be lost.
  - You are about to drop the column `salary` on the `jobs` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `jobs` table. All the data in the column will be lost.
  - Added the required column `created_by` to the `jobs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "JobStatus_new" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');
ALTER TABLE "jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "jobs" ALTER COLUMN "status" TYPE "JobStatus_new" USING ("status"::text::"JobStatus_new");
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "JobStatus_old";
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "createdAt",
DROP COLUMN "openings",
DROP COLUMN "postedDate",
DROP COLUMN "salary",
DROP COLUMN "updatedAt",
ADD COLUMN     "additional_comments" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "years_of_experience" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
