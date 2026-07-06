/**
 * Node.js PDF reader for OpenResume parser (pdfjs-dist, no browser worker).
 * Vendored algorithm from https://github.com/xitanggg/open-resume
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getDocument, type TextItem as PdfjsTextItem } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem, TextItems } from "@/src/lib/open-resume/parse-resume-from-pdf/types";

async function loadPdfBytes(source: string | Uint8Array): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  const trimmed = source.trim();
  if (trimmed.startsWith("file://")) {
    const buf = await readFile(new URL(trimmed));
    return new Uint8Array(buf);
  }
  const buf = await readFile(trimmed);
  return new Uint8Array(buf);
}

/**
 * Read PDF from filesystem path or bytes; return positioned text items.
 */
export async function readPdfFromPath(filePath: string): Promise<TextItems> {
  const data = await loadPdfBytes(filePath);
  return readPdfFromBytes(data);
}

export async function readPdfFromBytes(data: Uint8Array): Promise<TextItems> {
  const pdfFile = await getDocument({
    data,
    useSystemFonts: true,
    disableWorker: true,
  }).promise;

  let textItems: TextItems = [];

  for (let i = 1; i <= pdfFile.numPages; i++) {
    const page = await pdfFile.getPage(i);
    const textContent = await page.getTextContent();
    await page.getOperatorList();
    const commonObjs = page.commonObjs;

    const pageTextItems = textContent.items.map((item) => {
      const {
        str: text,
        transform,
        fontName: pdfFontName,
        ...otherProps
      } = item as PdfjsTextItem;

      const x = transform[4];
      const y = transform[5];

      let fontName = String(pdfFontName ?? "");
      try {
        const fontObj = commonObjs.get(pdfFontName) as { name?: string } | undefined;
        if (fontObj?.name) fontName = fontObj.name;
      } catch {
        // keep pdfFontName when commonObjs lookup fails in node
      }

      const newText = text.replace(/-­‐/g, "-");

      return {
        ...otherProps,
        fontName,
        text: newText,
        x,
        y,
      } as TextItem;
    });

    textItems.push(...pageTextItems);
  }

  textItems = textItems.filter((textItem) => !(!textItem.hasEOL && textItem.text.trim() === ""));
  return textItems;
}

/** Accept local path; also supports file:// URLs used by pdfjs in browser builds. */
export function toPdfLoadSource(filePath: string): string {
  if (filePath.startsWith("file://")) return filePath;
  return pathToFileURL(filePath).href;
}
