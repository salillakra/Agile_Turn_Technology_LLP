/**
 * Max lengths for Application text fields. Enforced in API to prevent abuse and DB bloat.
 */
export const MAX_FEEDBACK_LENGTH = 10_000;
export const MAX_NOTES_LENGTH = 20_000;
export const MAX_REJECTION_REASON_LENGTH = 2_000;

const LIMITS: Record<"feedback" | "notes" | "rejectionReason", { max: number; message: string }> = {
  feedback: {
    max: MAX_FEEDBACK_LENGTH,
    message: "Feedback exceeds maximum allowed length",
  },
  notes: {
    max: MAX_NOTES_LENGTH,
    message: "Notes exceeds maximum allowed length",
  },
  rejectionReason: {
    max: MAX_REJECTION_REASON_LENGTH,
    message: "Rejection reason exceeds maximum allowed length",
  },
};

/**
 * Returns { code: "TEXT_LIMIT_EXCEEDED", message } if value exceeds the limit for the field; null if valid.
 * Null or empty string is considered valid.
 */
export function validateApplicationText(
  field: "feedback" | "notes" | "rejectionReason",
  value: string | null | undefined
): { code: "TEXT_LIMIT_EXCEEDED"; message: string } | null {
  if (value == null || value.length === 0) return null;
  const { max, message } = LIMITS[field];
  if (value.length > max) {
    return { code: "TEXT_LIMIT_EXCEEDED", message };
  }
  return null;
}
