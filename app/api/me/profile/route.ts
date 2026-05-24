import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import {
  ProfileValidationError,
  applyProfileUpdate,
  loadProfileForUser,
  profileWithCompleteness,
} from "@/src/lib/user-profile-api";
import type { Role } from "@prisma/client";

/**
 * GET /api/me/profile — current user + profile + `profileCompleteness` (alias of GET /api/profile).
 */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!userId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const user = await loadProfileForUser(userId);
  if (!user) return apiError("NOT_FOUND", "User not found", 404);

  return NextResponse.json(profileWithCompleteness(user));
}

/**
 * PATCH /api/me/profile — same field rules as PUT /api/profile/update (role-scoped).
 */
export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!userId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const role = auth.session.user?.role as Role;

  try {
    const updated = await applyProfileUpdate(userId, role, body);
    return NextResponse.json(profileWithCompleteness(updated));
  } catch (e) {
    if (e instanceof ProfileValidationError) {
      return apiError(e.code, e.message, e.status);
    }
    throw e;
  }
}
