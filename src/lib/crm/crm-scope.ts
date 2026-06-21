import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/src/lib/rbac";

/** HM/recruiter: clients whose requirements link to jobs they are assigned to. */
export function buildCrmClientVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.CrmClientWhereInput {
  if (isAdmin(role) || !userId) return {};
  return {
    requirements: {
      some: {
        job: {
          assignments: { some: { userId } },
        },
      },
    },
  };
}

/** HM/recruiter: requirements on visible clients or owned by account. */
export function buildCrmRequirementVisibilityWhere(
  role: string | undefined,
  userId: string | undefined
): Prisma.CrmRequirementWhereInput {
  if (isAdmin(role) || !userId) return {};
  return {
    OR: [
      { client: { accountOwnerId: userId } },
      {
        job: {
          assignments: { some: { userId } },
        },
      },
    ],
  };
}
