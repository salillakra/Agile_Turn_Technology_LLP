import { createHash } from "node:crypto";
import { getResumeFile, getResumeStorageFileNameFromResumeUrl } from "@/src/lib/resume-storage";

/**
 * SHA-256 (hex) of the stored resume bytes referenced by `resumeUrl` (S3 API storage only).
 * Used for idempotency / change detection on `ResumeParseJob.fileHash`.
 */
export async function computeResumeSha256HexFromResumeUrl(
  resumeUrl: string
): Promise<
  { ok: true; hash: string } | { ok: false; reason: "INVALID_URL" | "FILE_NOT_FOUND" }
> {
  const bytes = await readResumeBytesFromResumeUrl(resumeUrl);
  if (bytes.ok === false) return bytes;
  return { ok: true, hash: createHash("sha256").update(bytes.buffer).digest("hex") };
}

/**
 * Reads raw bytes for the same `resumeUrl` used by hashing.
 * Used by the parse worker to feed a parser.
 */
export async function readResumeBytesFromResumeUrl(
  resumeUrl: string
): Promise<
  { ok: true; buffer: Buffer } | { ok: false; reason: "INVALID_URL" | "FILE_NOT_FOUND" }
> {
  const storageFileName = getResumeStorageFileNameFromResumeUrl(resumeUrl);
  if (!storageFileName) {
    return { ok: false, reason: "INVALID_URL" };
  }

  const buffer = await getResumeFile(storageFileName);
  if (!buffer) {
    return { ok: false, reason: "FILE_NOT_FOUND" };
  }
  return { ok: true, buffer };
}
