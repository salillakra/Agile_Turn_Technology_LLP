/**
 * Runs once when the Node.js server starts (not in Edge).
 * Ensures local resume storage exists before any upload/read handlers run.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureResumeUploadDir } = await import("@/src/lib/resume-storage");
    const { ensureProfileMediaDir } = await import("@/src/lib/profile-media-storage");
    ensureResumeUploadDir();
    ensureProfileMediaDir();
  }
}
