import type { StorageProviderName } from "@/src/lib/storage/types";

/**
 * `s3` = S3-compatible API (Cloudflare R2 or AWS S3).
 * Point at R2 with AWS_ENDPOINT_URL; omit it for AWS S3.
 */
export function getStorageProviderName(): StorageProviderName {
  const raw = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (raw === "local") return "local";
  if (raw === "s3" || raw === "r2") return "s3";
  return "s3";
}

export function isDirectUploadEnabled(): boolean {
  return getStorageProviderName() === "s3";
}
