import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import {
  ProfileValidationError,
  applyProfileUpdate,
  profileWithCompleteness,
} from "@/src/lib/user-profile-api";
import type { Role } from "@prisma/client";

/**
 * PUT /api/profile/update — full profile update (role-scoped fields).
 */
export async function PUT(request: Request) {
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
