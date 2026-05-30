import path from "node:path";
import {
  getResumeUploadDir,
  isPathInsideResumeDir,
  RESUME_READ_URL_PREFIX,
} from "@/src/lib/resume-storage";

/**
 * Resolve absolute filesystem path for a locally stored résumé (`Candidate.resumeUrl`).
 * Returns `null` for external URLs or unsupported references.
 */
export function resolveLocalResumeFilePath(resumeUrl: string): string | null {
  const trimmed = resumeUrl.trim();
  if (!trimmed.startsWith(RESUME_READ_URL_PREFIX)) return null;

  const encoded = trimmed.slice(RESUME_READ_URL_PREFIX.length).split("/")[0] ?? "";
  if (!encoded || encoded.includes("..")) return null;

  let fileName: string;
  try {
    fileName = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }

  const full = path.resolve(getResumeUploadDir(), fileName);
  if (!isPathInsideResumeDir(full)) return null;
  return full;
}

/** Absolute path when the stored résumé is a PDF readable by ai-service `/parse-resume`. */
export function resolveLocalResumePdfPath(resumeUrl: string): string | null {
  const full = resolveLocalResumeFilePath(resumeUrl);
  if (!full) return null;
  if (!full.toLowerCase().endsWith(".pdf")) return null;
  return full;
}
