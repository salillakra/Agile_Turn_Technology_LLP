/**
 * Best-effort removal of common contact patterns from free-text (for parsed résumé summaries).
 * Not a guarantee of anonymity — recruiters should still review before publishing.
 */
export function scrubContactInfo(input: string): string {
  let s = input;
  s = s.replace(/\b\+?\d[\d\s\-().]{7,22}\d\b/g, " ");
  s = s.replace(/\b\d{10}\b/g, " ");
  s = s.replace(/\S+@\S+\.\S+/g, " ");
  s = s.replace(/\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com)\/[^\s)\]]+/gi, " ");
  s = s.replace(/\b(?:www\.)?linkedin\.com[^\s)\]]*/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
