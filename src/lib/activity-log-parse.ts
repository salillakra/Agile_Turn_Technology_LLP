/** Parse `ActivityLog.details` JSON for API responses. */
export function parseActivityLogDetails(details: string | null): unknown {
  if (details == null) return null;
  try {
    return JSON.parse(details);
  } catch {
    return { text: details };
  }
}
