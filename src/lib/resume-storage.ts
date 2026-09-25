import { getStorage, getStorageProviderName } from "@/src/lib/storage";
import {
  isSafeLegacyFileName,
  isSafeObjectKey,
  toResumeObjectKey,
} from "@/src/lib/storage/object-keys";
import { mimeFromResumeFileName } from "@/src/lib/resume-mime";

/** Prefix used when storing `Candidate.resumeUrl` for files served by GET /api/resumes/local/[...path]. */
export const RESUME_READ_URL_PREFIX = "/api/resumes/local/";

/** @deprecated Use isSafeLegacyFileName / isSafeObjectKey. Kept for callers that still pass a single filename. */
export function isSafeStorageFileName(fileName: string): boolean {
  return isSafeLegacyFileName(fileName) || isSafeObjectKey(fileName);
}

export function resumeS3Key(fileName: string): string {
  return toResumeObjectKey(fileName) ?? `resumes/${fileName}`;
}

/**
 * Returns the storage key from a `resumeUrl` (`/api/resumes/local/<encoded>`).
 * Legacy URLs were a single filename; those map to `resumes/{fileName}`.
 */
export function getResumeStorageFileNameFromResumeUrl(resumeUrl: string): string | null {
  const trimmed = resumeUrl.trim();
  if (!trimmed.startsWith(RESUME_READ_URL_PREFIX)) return null;
  const rest = trimmed.slice(RESUME_READ_URL_PREFIX.length);
  if (!rest) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!decoded) return null;
  return toResumeObjectKey(decoded);
}

export function resumeReadUrl(objectKey: string): string {
  return `${RESUME_READ_URL_PREFIX}${encodeURIComponent(objectKey)}`;
}

export function candidateResumeDbFields(params: {
  objectKey: string;
  originalFileName: string;
  contentType: string;
  size: number;
  checksum: string | null;
}): {
  resumeUrl: string;
  resumeFileName: string;
  resumeObjectKey: string;
  resumeContentType: string;
  resumeSize: number;
  resumeChecksum: string | null;
  resumeUploadedAt: Date;
  storageProvider: string;
} {
  return {
    resumeUrl: resumeReadUrl(params.objectKey),
    resumeFileName: params.originalFileName,
    resumeObjectKey: params.objectKey,
    resumeContentType: params.contentType,
    resumeSize: params.size,
    resumeChecksum: params.checksum,
    resumeUploadedAt: new Date(),
    storageProvider: getStorageProviderName(),
  };
}

export async function putResumeFile(fileName: string, buffer: Buffer): Promise<void> {
  const key = toResumeObjectKey(fileName);
  if (!key) throw new Error("Invalid resume storage key");
  await getStorage().put(key, buffer, mimeFromResumeFileName(fileName));
}

export async function getResumeFile(fileName: string): Promise<Buffer | null> {
  const key = toResumeObjectKey(fileName);
  if (!key) return null;
  return getStorage().get(key);
}

export async function deleteResumeFile(fileName: string): Promise<void> {
  const key = toResumeObjectKey(fileName);
  if (!key) return;
  await getStorage().delete(key);
}

export async function headResumeFile(
  fileName: string
): Promise<{ contentType: string | null; contentLength: number | null } | null> {
  const key = toResumeObjectKey(fileName);
  if (!key) return null;
  return getStorage().head(key);
}

/**
 * Best-effort delete of a previously stored resume object when `resumeUrl` points at API storage.
 * Ignores failures (object already gone, external URL, etc.).
 */
export async function tryRemovePreviousResumeFile(
  previousResumeUrl: string | null | undefined
): Promise<void> {
  if (previousResumeUrl == null || typeof previousResumeUrl !== "string") return;
  const fileName = getResumeStorageFileNameFromResumeUrl(previousResumeUrl);
  if (!fileName) return;
  try {
    await deleteResumeFile(fileName);
  } catch {
    // ignore
  }
}

export async function tryRemoveResumeObjectKey(objectKey: string | null | undefined): Promise<void> {
  if (objectKey == null || typeof objectKey !== "string" || !toResumeObjectKey(objectKey)) return;
  try {
    await deleteResumeFile(objectKey);
  } catch {
    // ignore
  }
}
