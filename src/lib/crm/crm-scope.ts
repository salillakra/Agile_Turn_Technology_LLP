import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/src/lib/rbac";

/** CRM routes are ADMIN-only; scope helpers return unrestricted filters for admin callers. */
export function buildCrmClientVisibilityWhere(
  role: string | undefined,
  _userId: string | undefined
): Prisma.CrmClientWhereInput {
  if (isAdmin(role)) return {};
  return { id: "__no_access__" };
}

export function buildCrmRequirementVisibilityWhere(
  role: string | undefined,
  _userId: string | undefined
): Prisma.CrmRequirementWhereInput {
  if (isAdmin(role)) return {};
  return { id: "__no_access__" };
}
