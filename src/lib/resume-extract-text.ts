import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { RESUME_READ_URL_PREFIX } from "@/src/lib/resume-storage";
import type { AllowedResumeExt } from "@/src/lib/resume-upload-validation";
import { getResumeExtension } from "@/src/lib/resume-upload-validation";

/**
 * Returns the storage filename segment from a local `resumeUrl` (`/api/resumes/local/<encoded>`).
 */
export function getResumeStorageFileNameFromResumeUrl(resumeUrl: string): string | null {
  const trimmed = resumeUrl.trim();
  if (!trimmed.startsWith(RESUME_READ_URL_PREFIX)) return null;
  const rest = trimmed.slice(RESUME_READ_URL_PREFIX.length).split("/")[0] ?? "";
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/**
 * Extracts plain text from a resume buffer (PDF, DOCX, or legacy DOC).
 */
export async function extractPlainTextFromResumeBuffer(
  buffer: Buffer,
  ext: AllowedResumeExt
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    if (ext === ".pdf") {
      const data = await pdfParse(buffer);
      const text = typeof data.text === "string" ? data.text : "";
      return { ok: true, text: text.trim() };
    }
    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value ?? "";
      return { ok: true, text: text.trim() };
    }
    if (ext === ".doc") {
      const tmpPath = join(tmpdir(), `resume-${randomUUID()}.doc`);
      try {
        await writeFile(tmpPath, buffer);
        const extractor = new WordExtractor();
        const doc = await extractor.extract(tmpPath);
        const text = doc.getBody();
        return { ok: true, text: text.trim() };
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    }
    return { ok: false, error: "Unsupported extension." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Resolves extension from stored filename (e.g. `uuid.pdf`) or returns null.
 */
export function getResumeExtFromStorageFileName(fileName: string): AllowedResumeExt | null {
  return getResumeExtension(fileName);
}
