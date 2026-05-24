/**
 * Prisma uses cuid() for @id: starts with 'c', 25–27 chars, lowercase alphanumeric.
 * Reject obviously malformed values before hitting the DB.
 */
const CUID_REGEX = /^c[a-z0-9]{24,29}$/;

export function isValidCuid(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length < 25 || id.length > 30) return false;
  return CUID_REGEX.test(id);
}
