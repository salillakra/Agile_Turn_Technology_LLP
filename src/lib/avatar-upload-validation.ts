import { randomUUID } from "node:crypto";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export type AllowedAvatarExt = ".jpg" | ".jpeg" | ".png" | ".webp";

/**
 * Infer image extension from magic bytes (JPEG, PNG, WebP).
 */
export function detectAvatarExt(buffer: Buffer): AllowedAvatarExt | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return ".webp";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return ".png";
  }
  return null;
}

export function validateAvatarFile(params: {
  mimeType: string;
  buffer: Buffer;
}): { ok: true; ext: AllowedAvatarExt } | { ok: false; code: string; message: string } {
  if (params.buffer.length > MAX_AVATAR_BYTES) {
    return { ok: false, code: "FILE_TOO_LARGE", message: "Image must be 2MB or smaller." };
  }
  const ext = detectAvatarExt(params.buffer);
  if (ext == null) {
    return { ok: false, code: "INVALID_FILE_CONTENT", message: "Only JPEG, PNG, and WebP images are allowed." };
  }
  const mime = (params.mimeType ?? "").trim().toLowerCase();
  const allowedMime =
    ext === ".jpg" || ext === ".jpeg"
      ? ["image/jpeg", "image/jpg", "image/pjpeg"]
      : ext === ".png"
        ? ["image/png"]
        : ["image/webp"];
  const generic = new Set(["", "application/octet-stream"]);
  if (!generic.has(mime) && !allowedMime.includes(mime)) {
    return { ok: false, code: "INVALID_MIME", message: "Image MIME type does not match file content." };
  }
  return { ok: true, ext };
}

export function buildAvatarStoredFileName(ext: AllowedAvatarExt): string {
  const normalized = ext === ".jpeg" ? ".jpg" : ext;
  return `${randomUUID()}${normalized}`;
}
