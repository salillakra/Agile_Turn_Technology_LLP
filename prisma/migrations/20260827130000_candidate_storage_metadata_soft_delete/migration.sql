-- Candidate object-storage metadata + soft-delete.
-- Resume bytes live in S3-compatible storage; these columns are the DB side of that contract.

ALTER TABLE "candidates" ADD COLUMN "resume_object_key" TEXT;
ALTER TABLE "candidates" ADD COLUMN "resume_content_type" TEXT;
ALTER TABLE "candidates" ADD COLUMN "resume_size" INTEGER;
ALTER TABLE "candidates" ADD COLUMN "resume_checksum" TEXT;
ALTER TABLE "candidates" ADD COLUMN "resume_uploaded_at" TIMESTAMP(3);
ALTER TABLE "candidates" ADD COLUMN "storage_provider" TEXT;
ALTER TABLE "candidates" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "candidates_deleted_at_idx" ON "candidates"("deleted_at");
