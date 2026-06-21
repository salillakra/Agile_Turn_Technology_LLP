/**
 * pg v8 warns when sslmode is require/prefer/verify-ca (future libpq semantics).
 * Prisma Postgres URLs often use sslmode=require — normalize to verify-full.
 */
export function normalizeDatabaseUrl(url: string): string {
  let out = url.trim();
  if (!out) return out;

  out = out.replace(/([?&])sslmode=require\b/gi, "$1sslmode=verify-full");
  out = out.replace(/([?&])sslmode=prefer\b/gi, "$1sslmode=verify-full");
  out = out.replace(/([?&])sslmode=verify-ca\b/gi, "$1sslmode=verify-full");
  out = out.replace(/([?&])uselibpqcompat=true(&|$)/gi, (_, __, end) => (end === "" ? "" : "&"));
  out = out.replace(/\?&/, "?").replace(/[?&]$/, "");

  return out;
}
