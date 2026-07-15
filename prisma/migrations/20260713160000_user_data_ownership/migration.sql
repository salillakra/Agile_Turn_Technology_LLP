-- Strict per-user data silos: owner_id on jobs and candidates.

ALTER TABLE "jobs" ADD COLUMN "owner_id" TEXT;

UPDATE "jobs" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL;

ALTER TABLE "jobs" ALTER COLUMN "owner_id" SET NOT NULL;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "jobs_owner_id_idx" ON "jobs"("owner_id");

ALTER TABLE "candidates" ADD COLUMN "owner_id" TEXT;

UPDATE "candidates" c
SET "owner_id" = COALESCE(
  c."created_by_id",
  (
    SELECT j."owner_id"
    FROM "applications" a
    INNER JOIN "jobs" j ON j."id" = a."job_id"
    WHERE a."candidate_id" = c."id"
    ORDER BY a."applied_date" ASC
    LIMIT 1
  ),
  (SELECT u."id" FROM "users" u WHERE u."role" = 'ADMIN' ORDER BY u."createdAt" ASC LIMIT 1)
)
WHERE c."owner_id" IS NULL;

ALTER TABLE "candidates" ALTER COLUMN "owner_id" SET NOT NULL;

ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "candidates_owner_id_idx" ON "candidates"("owner_id");
