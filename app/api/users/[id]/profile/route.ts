import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { canViewUserProfile } from "@/src/lib/rbac";
import { PROFILE_MEDIA_READ_PREFIX } from "@/src/lib/profile-media-storage";

type VisibleProfileUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  profile: {
    jobTitle: string | null;
    department: string | null;
    location: string | null;
    bio: string | null;
    timezone: string | null;
    createdAt: Date;
    updatedAt: Date;
    // contact fields are conditionally added below when allowed:
    phone?: string | null;
    personalEmail?: string | null;
  } | null;
};

function isLooseValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** 0–100 — name, sign-in email, phone, photo, personal email (same factors as /api/profile). */
function computeCompletenessForVisible(user: VisibleProfileUser): number {
  const p = user.profile;
  if (!p) return 0;
  const personalEmail = typeof p.personalEmail === "string" ? p.personalEmail.trim() : "";
  const phone = typeof p.phone === "string" ? p.phone.trim() : "";
  const factors = [
    user.name?.trim(),
    user.email?.trim(),
    phone,
    (user.image?.trim() || "") !== "",
    personalEmail && isLooseValidEmail(personalEmail) ? personalEmail : "",
  ].filter(Boolean).length;
  return Math.round(Math.min(100, (factors / 5) * 100));
}

/** GET /api/users/[id]/profile — view another user's profile (read-only), role-scoped. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const viewerRole = auth.session.user?.role;
  const viewerUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!viewerUserId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const { id } = await ctx.params;
  const targetUserId = typeof id === "string" ? id.trim() : "";
  if (!targetUserId) return apiError("VALIDATION_ERROR", "Missing user id", 400);

  const base = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (!base) return apiError("NOT_FOUND", "User not found", 404);

  const isSelf = base.id === viewerUserId;
  if (!isSelf && !canViewUserProfile(viewerRole, base.role)) {
    return apiError("FORBIDDEN", "You are not allowed to view this user's profile", 403);
  }

  const allowContactFields = viewerRole === "ADMIN" || isSelf;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      profile: {
        select: {
          ...(allowContactFields ? { phone: true, personalEmail: true } : {}),
          avatarFileName: true,
          jobTitle: true,
          department: true,
          location: true,
          bio: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!user) return apiError("NOT_FOUND", "User not found", 404);

  const image =
    user.profile?.avatarFileName != null && user.profile.avatarFileName.trim()
      ? `/api/users/${encodeURIComponent(user.id)}/avatar`
      : user.image && user.image.startsWith(PROFILE_MEDIA_READ_PREFIX)
        ? `/api/users/${encodeURIComponent(user.id)}/avatar`
        : user.image;

  const out: VisibleProfileUser = { ...user, image, profile: user.profile };
  return NextResponse.json({
    ...out,
    profileCompleteness: computeCompletenessForVisible(out),
  });
}

