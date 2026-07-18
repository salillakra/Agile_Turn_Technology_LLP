/**
 * Strip common JD bullets / noise and collapse whitespace before LLM parse.
 */

const BULLET_CHARS =
  /[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25AA\u25A0\u25CB\u25E6•·▪▫●○■□‣∙]/g;

/** Remove bullets, normalize newlines/spaces. Empty input → "". */
export function cleanJdText(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) return "";

  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(BULLET_CHARS, " ")
    .replace(/^[ \t]*[-–—*]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
