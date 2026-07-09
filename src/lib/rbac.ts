/**
 * Role-based access control (RBAC).
 *
 * - Roles are stored on the User model (Prisma) and attached to the session token (auth.ts
 *   callbacks). The client and server both see session.user.role.
 * - Use these helpers in UI (with useSession().data.user.role) and in API routes (with
 *   getSession() then session.user.role) so the same rules apply everywhere. Always enforce
 *   role checks on the server for sensitive actions; UI hiding is not sufficient.
 */
export const ROLES = ["ADMIN", "RECRUITER", "HIRING_MANAGER"] as const;
export type Role = (typeof ROLES)[number];

/** ADMIN > HIRING_MANAGER > RECRUITER */
export function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

export function isHiringManager(role: string | undefined): boolean {
  return role === "HIRING_MANAGER";
}

export function isRecruiter(role: string | undefined): boolean {
  return role === "RECRUITER";
}

// ─── Job RBAC (final policy) ─────────────────────────────────────────────────────────────────
// ADMIN: create/update/delete, set OPEN/PAUSED/CLOSED, assign HMs.
// HIRING_MANAGER: update assigned jobs, set OPEN/PAUSED/CLOSED on assigned jobs, manage recruiter assignments.
// RECRUITER: view assigned jobs only (no create/update/delete/status mutation).

/** Only ADMIN can delete jobs. */
export function canDeleteJob(role: string | undefined): boolean {
  return isAdmin(role);
}

/** Only ADMIN can create jobs. */
export function canCreateJob(role: string | undefined): boolean {
  return isAdmin(role);
}

/** ADMIN and HIRING_MANAGER can update jobs (HM is still object-scoped in route checks). */
export function canUpdateJob(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role);
}

/** ADMIN and HIRING_MANAGER can set OPEN/PAUSED/CLOSED (HM object scope enforced in routes). */
export function canSetJobStatusTo(
  role: string | undefined,
  newStatus: "OPEN" | "PAUSED" | "CLOSED"
): boolean {
  void newStatus;
  return isAdmin(role) || isHiringManager(role);
}

/** ADMIN, HIRING_MANAGER and RECRUITER can add candidates (scope enforced per job in routes). */
export function canCreateCandidate(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role) || isRecruiter(role);
}

/** ADMIN, HIRING_MANAGER and RECRUITER can edit candidates (scope enforced per job in routes). */
export function canEditCandidate(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role) || isRecruiter(role);
}

/** ADMIN, HIRING_MANAGER and RECRUITER can delete candidates (scope enforced per job in routes). */
export function canDeleteCandidate(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role) || isRecruiter(role);
}

/** Only ADMIN can delete candidates (stricter than canDeleteCandidate). */
export function canDeleteCandidateAdmin(role: string | undefined): boolean {
  return isAdmin(role);
}

/** All defined roles can view candidates; HM/recruiter are constrained to assigned-job scope. */
export function canViewCandidates(role: string | undefined): boolean {
  return ROLES.includes(role as Role);
}

/** False in final policy (HM/recruiter are not view-only). */
export function isViewOnlyCandidates(role: string | undefined): boolean {
  void role;
  return false;
}

// ─── resume file RBAC (uploads/downloads under /api/resumes/*, /api/candidates/[id]/resume) ─
// ADMIN, HIRING_MANAGER, RECRUITER: upload/download/delete.

/** All roles may upload or replace resume files (scope enforced in routes). */
export function canUploadResume(role: string | undefined): boolean {
  return canViewCandidates(role);
}

/** ADMIN, RECRUITER, and HIRING_MANAGER may download/read resume files (aligned with candidate visibility). */
export function canReadResume(role: string | undefined): boolean {
  return canViewCandidates(role);
}

/** All roles may delete resume files (scope enforced in routes). */
export function canDeleteResume(role: string | undefined): boolean {
  return canViewCandidates(role);
}

/** ADMIN and HIRING_MANAGER can assign/remove recruiters on jobs (HM scope checked in routes). */
export function canManageRecruiterAssignments(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role);
}

/** Only ADMIN can assign HIRING_MANAGER users to jobs. */
export function canAssignHiringManagers(role: string | undefined): boolean {
  return isAdmin(role);
}

/** Role-level pipeline mutation gate (specific transitions enforced by `canTransitionStage`). */
export function canMutatePipeline(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role) || isRecruiter(role);
}

/**
 * Recruiter is restricted to:
 * - APPLIED -> SCREENING
 * - early rejection from APPLIED or SCREENING
 * ADMIN/HIRING_MANAGER can perform all valid transitions (route still validates transition graph).
 */
export function canTransitionStage(
  role: string | undefined,
  from: string,
  to: string
): boolean {
  if (isAdmin(role) || isHiringManager(role)) return true;
  if (!isRecruiter(role)) return false;
  if (from === "APPLIED" && to === "SCREENING") return true;
  if ((from === "APPLIED" || from === "SCREENING") && to === "REJECTED") return true;
  return false;
}

// ─── User directory / profile visibility ────────────────────────────────────────────────
// Final policy (viewer -> visible target roles):
// - ADMIN sees RECRUITER + HIRING_MANAGER
// - RECRUITER sees ADMIN + HIRING_MANAGER
// - HIRING_MANAGER sees ADMIN + RECRUITER

export function visibleUserRolesFor(viewerRole: string | undefined): Role[] {
  if (viewerRole === "ADMIN") return ["RECRUITER", "HIRING_MANAGER"];
  if (viewerRole === "RECRUITER") return ["ADMIN", "RECRUITER", "HIRING_MANAGER"];
  if (viewerRole === "HIRING_MANAGER") return ["ADMIN", "RECRUITER", "HIRING_MANAGER"];
  return [];
}

export function canViewUserProfile(viewerRole: string | undefined, targetRole: string | undefined): boolean {
  if (!targetRole) return false;
  return visibleUserRolesFor(viewerRole).includes(targetRole as Role);
}

/** Only ADMIN can invite new users to the platform. */
export function canInviteUsers(role: string | undefined): boolean {
  return isAdmin(role);
}
