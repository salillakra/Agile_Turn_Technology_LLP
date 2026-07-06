/**
 * OpenResume PDF parser — server entry (Node.js + pdfjs-dist).
 *
 * Algorithm: https://www.open-resume.com/resume-parser
 * Source: https://github.com/xitanggg/open-resume (AGPL-3.0, see OPEN-RESUME-AGPL-LICENSE.txt)
 *
 * Single-column English PDFs only.
 */

import { readPdfFromBytes, readPdfFromPath } from "@/src/lib/open-resume/parse-resume-from-pdf/read-pdf-node";
import { groupTextItemsIntoLines } from "@/src/lib/open-resume/parse-resume-from-pdf/group-text-items-into-lines";
import { groupLinesIntoSections } from "@/src/lib/open-resume/parse-resume-from-pdf/group-lines-into-sections";
import { extractResumeFromSections } from "@/src/lib/open-resume/parse-resume-from-pdf/extract-resume-from-sections";
import type { OpenResumeParse } from "@/src/lib/open-resume/resume-types";

export type { OpenResumeParse } from "@/src/lib/open-resume/resume-types";

export async function parseOpenResumeFromPdfPath(filePath: string): Promise<OpenResumeParse> {
  const textItems = await readPdfFromPath(filePath);
  return runOpenResumePipeline(textItems);
}

export async function parseOpenResumeFromPdfBuffer(buffer: Buffer): Promise<OpenResumeParse> {
  const textItems = await readPdfFromBytes(new Uint8Array(buffer));
  return runOpenResumePipeline(textItems);
}

function runOpenResumePipeline(textItems: Awaited<ReturnType<typeof readPdfFromPath>>): OpenResumeParse {
  const lines = groupTextItemsIntoLines(textItems);
  const sections = groupLinesIntoSections(lines);
  return extractResumeFromSections(sections);
}
