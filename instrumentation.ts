/**
 * Runs once when the Node.js server starts (not in Edge).
 * S3 bucket probe is only for STORAGE_PROVIDER=s3 (R2 / AWS). Local disk needs nothing.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getStorageProviderName } = await import("@/src/lib/storage/provider");
  if (getStorageProviderName() !== "s3") return;
  const { ensureS3Bucket } = await import("@/src/lib/s3");
  try {
    await ensureS3Bucket();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[instrumentation] S3 bucket check failed (uploads will error until storage is reachable):", msg);
  }
}
