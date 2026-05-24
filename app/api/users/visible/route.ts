import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { visibleUserRolesFor } from "@/src/lib/rbac";
import { PROFILE_MEDIA_READ_PREFIX } from "@/src/lib/profile-media-storage";

/** GET /api/users/visible — role-based user directory for viewing profiles (all signed-in roles). */
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const viewerRole = auth.session.user?.role;
  const viewerUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!viewerUserId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const visibleRoles = visibleUserRolesFor(viewerRole);
  if (visibleRoles.length === 0) return NextResponse.json({ data: [] });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const roleParam = searchParams.get("role")?.trim() ?? "";
  const roleFilter = visibleRoles.includes(roleParam as (typeof visibleRoles)[number])
    ? (roleParam as (typeof visibleRoles)[number])
    : undefined;

  const users = await prisma.user.findMany({
    where: {
      id: { not: viewerUserId },
      role: roleFilter ? roleFilter : { in: visibleRoles },
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
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      profile: { select: { avatarFileName: true } },
    },
  });

  const data = users.map((u) => {
    const hasAvatarFile = typeof u.profile?.avatarFileName === "string" && u.profile.avatarFileName.trim().length > 0;
    const image =
      hasAvatarFile
        ? `/api/users/${encodeURIComponent(u.id)}/avatar`
        : u.image && u.image.startsWith(PROFILE_MEDIA_READ_PREFIX)
          ? `/api/users/${encodeURIComponent(u.id)}/avatar`
          : u.image;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      image,
    };
  });

  return NextResponse.json({ data });
}

