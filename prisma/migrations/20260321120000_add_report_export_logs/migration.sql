-- CreateTable
CREATE TABLE "report_export_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "export_type" TEXT NOT NULL,
    "report_range" TEXT NOT NULL,
    "job_id" TEXT,
    "department" TEXT,
    "row_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_export_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_export_logs_user_id_created_at_idx" ON "report_export_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "report_export_logs_created_at_idx" ON "report_export_logs"("created_at");

-- AddForeignKey
ALTER TABLE "report_export_logs" ADD CONSTRAINT "report_export_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
