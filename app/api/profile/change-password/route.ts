import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";

/**
 * POST /api/profile/change-password
 * Body: { currentPassword: string, newPassword: string }
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!userId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return apiError("VALIDATION_ERROR", "currentPassword and newPassword are required", 400);
  }
  if (newPassword.length < 8) {
    return apiError("VALIDATION_ERROR", "newPassword must be at least 8 characters", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) return apiError("NOT_FOUND", "User not found", 404);

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return apiError("FORBIDDEN", "Current password is incorrect", 403);

  const saltRounds = 12;
  const hashed = await bcrypt.hash(newPassword, saltRounds);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  return NextResponse.json({ ok: true, message: "Password updated." });
}
