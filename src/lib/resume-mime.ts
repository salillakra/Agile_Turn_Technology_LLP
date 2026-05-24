/** MIME type for resume downloads from stored file name. */
export function mimeFromResumeFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

/** Safe single-line value for Content-Disposition filename= (no CR/LF/quotes/slashes). */
export function sanitizeContentDispositionFilename(name: string): string {
  return name.replace(/[\r\n"\\/]/g, "_").trim().slice(0, 200) || "resume";
}
