import { isAdmin, isHiringManager, isRecruiter } from "@/src/lib/rbac";

/** All staff roles can view CRM data (scoped in routes for HM). */
export function canViewCrm(role: string | undefined): boolean {
  return isAdmin(role) || isHiringManager(role) || isRecruiter(role);
}

/** ADMIN and RECRUITER can create/update CRM records. */
export function canManageCrm(role: string | undefined): boolean {
  return isAdmin(role) || isRecruiter(role);
}

/** ADMIN and RECRUITER can convert leads and manage client accounts. */
export function canManageCrmAccounts(role: string | undefined): boolean {
  return isAdmin(role) || isRecruiter(role);
}
