import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ensureResumeUploadDir,
  RESUME_READ_URL_PREFIX,
  safeResumeFilePath,
} from "@/src/lib/resume-storage";

/**
 * SHA-256 (hex) of the on-disk resume bytes referenced by `resumeUrl` (local API storage only).
 * Used for idempotency / change detection on `ResumeParseJob.fileHash`.
 */
export async function computeResumeSha256HexFromResumeUrl(
  resumeUrl: string
): Promise<
  { ok: true; hash: string } | { ok: false; reason: "INVALID_URL" | "FILE_NOT_FOUND" }
> {
  const trimmed = resumeUrl.trim();
  if (!trimmed.startsWith(RESUME_READ_URL_PREFIX)) {
    return { ok: false, reason: "INVALID_URL" };
  }

  const rest = trimmed.slice(RESUME_READ_URL_PREFIX.length).split("/")[0] ?? "";
  if (!rest) {
    return { ok: false, reason: "INVALID_URL" };
  }

  let storageFileName: string;
  try {
    storageFileName = decodeURIComponent(rest);
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }

  const fullPath = safeResumeFilePath([storageFileName]);
  if (fullPath == null) {
    return { ok: false, reason: "INVALID_URL" };
  }

  ensureResumeUploadDir();

  try {
    const buf = await readFile(fullPath);
    const hash = createHash("sha256").update(buf).digest("hex");
    return { ok: true, hash };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { ok: false, reason: "FILE_NOT_FOUND" };
    }
    throw e;
  }
}

/**
 * Reads raw bytes for the same local-storage `resumeUrl` used by hashing.
 * Used by the parse worker to feed a parser.
 */
export async function readResumeBytesFromResumeUrl(
  resumeUrl: string
): Promise<
  { ok: true; buffer: Buffer } | { ok: false; reason: "INVALID_URL" | "FILE_NOT_FOUND" }
> {
  const trimmed = resumeUrl.trim();
  if (!trimmed.startsWith(RESUME_READ_URL_PREFIX)) {
    return { ok: false, reason: "INVALID_URL" };
  }

  const rest = trimmed.slice(RESUME_READ_URL_PREFIX.length).split("/")[0] ?? "";
  if (!rest) {
    return { ok: false, reason: "INVALID_URL" };
  }

  let storageFileName: string;
  try {
    storageFileName = decodeURIComponent(rest);
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }

  const fullPath = safeResumeFilePath([storageFileName]);
  if (fullPath == null) {
    return { ok: false, reason: "INVALID_URL" };
  }

  ensureResumeUploadDir();

  try {
    const buffer = await readFile(fullPath);
    return { ok: true, buffer };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { ok: false, reason: "FILE_NOT_FOUND" };
    }
    throw e;
  }
}
