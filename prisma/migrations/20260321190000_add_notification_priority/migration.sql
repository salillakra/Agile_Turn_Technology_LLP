-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "priority" "NotificationPriority";

-- CreateIndex
CREATE INDEX "notifications_user_id_priority_idx" ON "notifications"("user_id", "priority");
