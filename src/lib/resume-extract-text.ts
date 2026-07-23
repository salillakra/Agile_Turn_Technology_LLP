import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { readPdfFromBytes } from "@/src/lib/open-resume/parse-resume-from-pdf/read-pdf-node";
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

/** pdfjs fallback when pdf-parse dies on damaged XRef / broken PDFs. */
async function extractPdfTextViaPdfjs(
  buffer: Buffer
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const items = await readPdfFromBytes(new Uint8Array(buffer));
    const text = items
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return { ok: false, error: "No text could be extracted from this PDF." };
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
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
      try {
        const data = await pdfParse(buffer);
        const text = typeof data.text === "string" ? data.text.trim() : "";
        if (text) return { ok: true, text };
      } catch (e) {
        const primary = e instanceof Error ? e.message : String(e);
        const fallback = await extractPdfTextViaPdfjs(buffer);
        if (fallback.ok) return fallback;
        return {
          ok: false,
          error: primary || fallback.error || "PDF text extraction failed",
        };
      }
      // Empty pdf-parse output — try pdfjs (some damaged PDFs return blank text).
      const fallback = await extractPdfTextViaPdfjs(buffer);
      if (fallback.ok) return fallback;
      return { ok: true, text: "" };
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
