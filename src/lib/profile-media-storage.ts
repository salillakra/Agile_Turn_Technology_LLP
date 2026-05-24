import fs from "node:fs";
import path from "node:path";

export const PROFILE_MEDIA_RELATIVE_SEGMENTS = ["uploads", "profile-media"] as const;

/** Public URL prefix for GET /api/profile/media/[...path] */
export const PROFILE_MEDIA_READ_PREFIX = "/api/profile/media/";

export function getProfileMediaDir(): string {
  const override = process.env.PROFILE_MEDIA_UPLOAD_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), ...PROFILE_MEDIA_RELATIVE_SEGMENTS);
}

export function ensureProfileMediaDir(): void {
  fs.mkdirSync(getProfileMediaDir(), { recursive: true });
}

export function isPathInsideProfileMediaDir(resolvedPath: string): boolean {
  const root = path.resolve(getProfileMediaDir());
  const target = path.resolve(resolvedPath);
  if (target === root) return true;
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return target.startsWith(prefix);
}

export function safeProfileMediaPath(segments: string[]): string | null {
  if (!segments.length) return null;
  if (segments.some((s) => s === ".." || s.includes("/") || s.includes("\\"))) return null;
  const full = path.resolve(getProfileMediaDir(), ...segments);
  return isPathInsideProfileMediaDir(full) ? full : null;
}

export async function tryRemoveProfileMediaFile(fileName: string | null | undefined): Promise<void> {
  if (fileName == null || typeof fileName !== "string" || !fileName.trim()) return;
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return;
  const full = path.resolve(getProfileMediaDir(), fileName);
  if (!isPathInsideProfileMediaDir(full)) return;
  try {
    const f = await import("node:fs/promises");
    await f.unlink(full);
  } catch {
    // ignore
  }
}
