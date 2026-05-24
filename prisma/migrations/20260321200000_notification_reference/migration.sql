-- CreateEnum
CREATE TYPE "NotificationReferenceType" AS ENUM ('APPLICATION', 'CANDIDATE');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "reference_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "reference_type" "NotificationReferenceType";

-- CreateIndex
CREATE INDEX "notifications_reference_type_reference_id_idx" ON "notifications"("reference_type", "reference_id");
