import { getStorage } from "@/src/lib/storage";
import { isSafeLegacyFileName, isSafeObjectKey, toProfileMediaObjectKey } from "@/src/lib/storage/object-keys";

/** Public URL prefix for GET /api/profile/media/[...path] */
export const PROFILE_MEDIA_READ_PREFIX = "/api/profile/media/";

export function isSafeProfileMediaFileName(fileName: string): boolean {
  return isSafeLegacyFileName(fileName) || isSafeObjectKey(fileName);
}

export function profileMediaS3Key(fileName: string): string {
  return toProfileMediaObjectKey(fileName) ?? `profile-media/${fileName}`;
}

function mimeForAvatarFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function putProfileMediaFile(fileName: string, buffer: Buffer): Promise<void> {
  const key = toProfileMediaObjectKey(fileName);
  if (!key) throw new Error("Invalid profile media storage key");
  await getStorage().put(key, buffer, mimeForAvatarFileName(fileName));
}

export async function getProfileMediaFile(fileName: string): Promise<Buffer | null> {
  const key = toProfileMediaObjectKey(fileName);
  if (!key) return null;
  return getStorage().get(key);
}

export async function tryRemoveProfileMediaFile(fileName: string | null | undefined): Promise<void> {
  if (fileName == null || typeof fileName !== "string" || !fileName.trim()) return;
  const key = toProfileMediaObjectKey(fileName);
  if (!key) return;
  try {
    await getStorage().delete(key);
  } catch {
    // ignore
  }
}
