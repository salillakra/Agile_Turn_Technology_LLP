import fs from "node:fs";
import path from "node:path";

/** Relative to `process.cwd()` (Next.js project root) when `RESUME_UPLOAD_DIR` is unset. */
export const RESUME_UPLOAD_RELATIVE_SEGMENTS = ["uploads", "resumes"] as const;

/**
 * Absolute directory for local resume files.
 * Override with `RESUME_UPLOAD_DIR` (absolute path, or path relative to `process.cwd()`).
 */
export function getResumeUploadDir(): string {
  const override = process.env.RESUME_UPLOAD_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), ...RESUME_UPLOAD_RELATIVE_SEGMENTS);
}

/**
 * Ensures the resume upload directory exists. Safe to call on every server startup / before writes.
 */
export function ensureResumeUploadDir(): void {
  fs.mkdirSync(getResumeUploadDir(), { recursive: true });
}

/**
 * Returns true if `resolvedPath` is the upload root or a file inside it (prevents `..` traversal).
 */
export function isPathInsideResumeDir(resolvedPath: string): boolean {
  const root = path.resolve(getResumeUploadDir());
  const target = path.resolve(resolvedPath);
  if (target === root) return true;
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return target.startsWith(prefix);
}

/**
 * Joins path segments under the resume dir and returns an absolute path, or `null` if traversal is attempted.
 */
export function safeResumeFilePath(segments: string[]): string | null {
  if (!segments.length) return null;
  if (segments.some((s) => s === ".." || s.includes("/") || s.includes("\\"))) {
    return null;
  }
  const full = path.resolve(getResumeUploadDir(), ...segments);
  return isPathInsideResumeDir(full) ? full : null;
}

/** Prefix used when storing `Candidate.resumeUrl` for files served by GET /api/resumes/local/[...path]. */
export const RESUME_READ_URL_PREFIX = "/api/resumes/local/";

/**
 * Best-effort delete of a previously stored resume file when `resumeUrl` points at local API storage.
 * Ignores failures (file already gone, external URL, etc.).
 */
export async function tryRemovePreviousResumeFile(
  previousResumeUrl: string | null | undefined
): Promise<void> {
  if (previousResumeUrl == null || typeof previousResumeUrl !== "string") return;
  if (!previousResumeUrl.startsWith(RESUME_READ_URL_PREFIX)) return;
  const rest = previousResumeUrl.slice(RESUME_READ_URL_PREFIX.length).split("/")[0] ?? "";
  if (!rest || rest.includes("..")) return;
  let fileName: string;
  try {
    fileName = decodeURIComponent(rest);
  } catch {
    return;
  }
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return;
  const full = path.resolve(getResumeUploadDir(), fileName);
  if (!isPathInsideResumeDir(full)) return;
  try {
    const fs = await import("node:fs/promises");
    await fs.unlink(full);
  } catch {
    // ignore
  }
}
