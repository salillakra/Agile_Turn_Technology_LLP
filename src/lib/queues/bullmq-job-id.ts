/**
 * BullMQ v5+ rejects `:` in custom job ids ("Custom Id cannot contain :").
 *
 * We keep higher-level code's human-readable templates (often colon-delimited)
 * but sanitize at the queue boundary so enqueue calls never crash.
 */
export function sanitizeBullmqJobId(jobId: string): string {
  const raw = typeof jobId === "string" ? jobId : "";
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // Replace colon (BullMQ restriction) and collapse whitespace.
  return trimmed.replace(/:/g, "_").replace(/\s+/g, " ");
}

