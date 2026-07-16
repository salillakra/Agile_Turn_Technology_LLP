import { isAdmin } from "@/src/lib/rbac";

/** CRM is ADMIN-only (strict user silos; no HM/recruiter CRM access). */
export function canViewCrm(role: string | undefined): boolean {
  return isAdmin(role);
}

export function canManageCrm(role: string | undefined): boolean {
  return isAdmin(role);
}

export function canManageCrmAccounts(role: string | undefined): boolean {
  return isAdmin(role);
}
