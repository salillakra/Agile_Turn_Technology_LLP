import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canManageRecruiterAssignments } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";

const ALLOWED_ROLES = ["HIRING_MANAGER", "RECRUITER"] as const;

/** GET /api/users — user picker for ADMIN audit assignments. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canManageRecruiterAssignments);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const roleQueryRaw = searchParams.get("role")?.trim() ?? "";
  const roleQuery = ALLOWED_ROLES.includes(roleQueryRaw as (typeof ALLOWED_ROLES)[number])
    ? (roleQueryRaw as (typeof ALLOWED_ROLES)[number])
    : undefined;

  const users = await prisma.user.findMany({
    where: {
      role: roleQuery ?? { in: [...ALLOWED_ROLES] },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
    take: 50,
  });

  return NextResponse.json({ data: users });
}
