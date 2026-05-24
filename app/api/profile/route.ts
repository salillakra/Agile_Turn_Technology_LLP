import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { loadProfileForUser, profileWithCompleteness } from "@/src/lib/user-profile-api";

/**
 * GET /api/profile — current user profile + `profileCompleteness` (0–100).
 * Auth: NextAuth session (same security model as JWT-protected REST APIs in this app).
 */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!userId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  try {
    const user = await loadProfileForUser(userId);
    if (!user) return apiError("NOT_FOUND", "User not found", 404);

    return NextResponse.json(profileWithCompleteness(user));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const hint =
        e.code === "P2022"
          ? "Database schema is behind the app. Run: npx prisma migrate deploy"
          : undefined;
      if (process.env.NODE_ENV === "development") {
        console.error("[GET /api/profile] Prisma error", e.code, e.message, hint);
      }
      return apiError(
        "DATABASE_SCHEMA_ERROR",
        hint ?? "Could not load profile from the database.",
        503,
        { prismaCode: e.code }
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[GET /api/profile]", e);
    }
    throw e;
  }
}
