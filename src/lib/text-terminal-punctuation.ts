/**
 * Ensures prose fields (e.g. experience summary) end with terminal punctuation.
 */
export function ensureEndsWithFullStop(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.!?…]["')\]]*$/.test(t)) return t;
  return `${t}.`;
}

/** Truncate at a word boundary, then end with a full stop (no ellipsis). */
export function truncateSummaryWithFullStop(text: string, maxLen: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return collapsed;
  let s =
    collapsed.length <= maxLen
      ? collapsed
      : collapsed
          .slice(0, maxLen)
          .replace(/\s+\S*$/, "")
          .replace(/[,;:\-–—]+$/, "")
          .trim();
  if (!s) s = collapsed.slice(0, maxLen).trim();
  return ensureEndsWithFullStop(s);
}
