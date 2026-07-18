/**
 * Application deep links:
 * - Candidates (status): `/applications/:id` (public)
 * - Recruiters (pipeline): `/applicants?applicationId=`
 */

/** Strip trailing junk some clients leave on path ids (`…id&`, `…id?utm=…`). */
export function sanitizeApplicationIdParam(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw trim */
  }
  return s.split(/[&?#]/)[0]?.trim() ?? "";
}

/** Public candidate status path. */
export function applicationStatusPath(applicationId: string): string {
  const id = sanitizeApplicationIdParam(applicationId);
  if (!id) return "/";
  return `/applications/${encodeURIComponent(id)}`;
}

/** Absolute URL for candidate-facing “view status” email buttons. */
export function applicationStatusUrl(appBaseUrl: string, applicationId: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}${applicationStatusPath(applicationId)}`;
}

/** Path used by Kanban / NotificationBell / recruiter Applicants deep links. */
export function applicationApplicantsPath(applicationId: string): string {
  const id = sanitizeApplicationIdParam(applicationId);
  if (!id) return "/applicants";
  return `/applicants?applicationId=${encodeURIComponent(id)}`;
}

/** Absolute URL for internal recruiter email buttons. */
export function applicationApplicantsUrl(appBaseUrl: string, applicationId: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}${applicationApplicantsPath(applicationId)}`;
}
