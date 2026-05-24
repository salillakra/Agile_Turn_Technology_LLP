import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import {
  canManageRecruiterAssignments,
  isAdmin,
  isHiringManager,
} from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";

const ALLOWED_ROLES = ["HIRING_MANAGER", "RECRUITER"] as const;

/** GET /api/users — lightweight user picker for job assignments. ADMIN/HIRING_MANAGER only. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canManageRecruiterAssignments);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const roleQueryRaw = searchParams.get("role")?.trim() ?? "";
  const roleQuery = ALLOWED_ROLES.includes(roleQueryRaw as (typeof ALLOWED_ROLES)[number])
    ? (roleQueryRaw as (typeof ALLOWED_ROLES)[number])
    : undefined;

  // Final policy:
  // - ADMIN assigns only HIRING_MANAGER
  // - HIRING_MANAGER assigns only RECRUITER
  const forcedRole = isAdmin(role)
    ? "HIRING_MANAGER"
    : isHiringManager(role)
      ? "RECRUITER"
      : roleQuery ?? "RECRUITER";

  const users = await prisma.user.findMany({
    where: {
      ...(forcedRole ? { role: forcedRole } : { role: { in: [...ALLOWED_ROLES] } }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return NextResponse.json({ data: users });
}
