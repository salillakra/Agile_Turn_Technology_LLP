-- CreateTable
CREATE TABLE "job_assignments" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,

    CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_assignments_user_id_idx" ON "job_assignments"("user_id");

-- CreateIndex
CREATE INDEX "job_assignments_job_id_idx" ON "job_assignments"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_assignments_job_id_user_id_key" ON "job_assignments"("job_id", "user_id");

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
