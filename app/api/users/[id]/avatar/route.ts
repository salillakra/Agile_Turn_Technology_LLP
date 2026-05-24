import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import { canViewUserProfile } from "@/src/lib/rbac";
import { ensureProfileMediaDir, safeProfileMediaPath } from "@/src/lib/profile-media-storage";

export const runtime = "nodejs";

function mimeForFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * GET /api/users/[id]/avatar — serve a user's uploaded avatar to authorized viewers.
 * Authorization: self OR viewer-role matrix allows viewing target role.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const viewerRole = auth.session.user?.role;
  const viewerUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!viewerUserId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const { id } = await ctx.params;
  const targetUserId = typeof id === "string" ? id.trim() : "";
  if (!targetUserId) return apiError("VALIDATION_ERROR", "Missing user id", 400);

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, profile: { select: { avatarFileName: true } } },
  });
  if (!target) return apiError("NOT_FOUND", "User not found", 404);

  const isSelf = target.id === viewerUserId;
  if (!isSelf && !canViewUserProfile(viewerRole, target.role)) {
    return apiError("FORBIDDEN", "You are not allowed to view this user's avatar", 403);
  }

  const fileName = target.profile?.avatarFileName ?? null;
  if (!fileName) return apiError("NOT_FOUND", "No avatar", 404);

  const fullPath = safeProfileMediaPath([fileName]);
  if (fullPath == null) return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);

  ensureProfileMediaDir();

  try {
    const st = await stat(fullPath);
    if (!st.isFile()) return apiError("NOT_FOUND", "Not found", 404);
    const buf = await readFile(fullPath);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mimeForFileName(fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return apiError("NOT_FOUND", "Not found", 404);
    throw e;
  }
}

