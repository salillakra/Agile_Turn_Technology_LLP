import { randomUUID } from "node:crypto";

/** Default max résumé upload size (5 MiB). Override with env `MAX_RESUME_BYTES`. */
export const DEFAULT_MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** API error message when size limit is exceeded (paired with code `FILE_TOO_LARGE`, HTTP 400). */
export const RESUME_FILE_TOO_LARGE_MESSAGE = "Resume must be less than 5MB";

export function getMaxResumeBytes(): number {
  const raw = process.env.MAX_RESUME_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_RESUME_BYTES;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RESUME_BYTES;
}

export type AllowedResumeExt = ".pdf" | ".doc" | ".docx";

const ALLOWED: Record<
  AllowedResumeExt,
  { mime: readonly string[]; validateBuffer: (buf: Buffer) => boolean }
> = {
  ".pdf": {
    mime: ["application/pdf"],
    validateBuffer: (buf) => buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF",
  },
  ".docx": {
    mime: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip", // some clients label OOXML packages as zip
    ],
    validateBuffer: (buf) =>
      buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04,
  },
  ".doc": {
    mime: ["application/msword"],
    validateBuffer: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0xd0 &&
      buf[1] === 0xcf &&
      buf[2] === 0x11 &&
      buf[3] === 0xe0 &&
      buf[4] === 0xa1 &&
      buf[5] === 0xb1 &&
      buf[6] === 0x1a &&
      buf[7] === 0xe1,
  },
};

const GENERIC_MIME = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/**
 * Returns normalized extension (lowercase, includes dot) or null.
 */
export function getResumeExtension(originalName: string): AllowedResumeExt | null {
  const base = originalName.trim();
  const dot = base.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = base.slice(dot).toLowerCase();
  if (ext === ".pdf" || ext === ".doc" || ext === ".docx") return ext;
  return null;
}

/**
 * Validates declared MIME vs extension and file contents (magic bytes).
 * Browsers may send wrong or generic MIME; we never trust extension alone.
 */
export function validateResumeFile(params: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): { ok: true; ext: AllowedResumeExt } | { ok: false; code: string; message: string } {
  const ext = getResumeExtension(params.originalName);
  if (ext == null) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: "Only PDF, DOC, and DOCX files are allowed (check file extension).",
    };
  }

  const rule = ALLOWED[ext];
  const mime = (params.mimeType ?? "").trim().toLowerCase();

  if (!GENERIC_MIME.has(mime) && !rule.mime.includes(mime)) {
    return {
      ok: false,
      code: "INVALID_MIME",
      message: `MIME type does not match allowed type for ${ext}.`,
    };
  }

  if (!rule.validateBuffer(params.buffer)) {
    return {
      ok: false,
      code: "INVALID_FILE_CONTENT",
      message: "File content does not match an allowed format (possible spoofed extension).",
    };
  }

  return { ok: true, ext };
}

/**
 * Stored file name only (single path segment): `{uuid}{ext}` — no user-controlled characters.
 */
export function buildStoredFileName(ext: AllowedResumeExt): string {
  return `${randomUUID()}${ext}`;
}
