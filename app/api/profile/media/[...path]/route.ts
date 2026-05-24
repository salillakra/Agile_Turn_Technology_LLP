import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
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
 * GET /api/profile/media/[...path] — serve uploaded profile avatar for the owning user only.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!userId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const { path: segments } = await context.params;
  const decoded = (segments ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  if (decoded.length !== 1) {
    return apiError("INVALID_PATH", "Invalid path", 400);
  }

  const fileName = decoded[0]!;
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { avatarFileName: true },
  });

  if (!profile?.avatarFileName || profile.avatarFileName !== fileName) {
    return apiError("NOT_FOUND", "Not found", 404);
  }

  const fullPath = safeProfileMediaPath([fileName]);
  if (fullPath == null) {
    return apiError("INVALID_PATH", "Invalid or unsafe file path", 400);
  }

  ensureProfileMediaDir();

  try {
    const st = await stat(fullPath);
    if (!st.isFile()) {
      return apiError("NOT_FOUND", "Not found", 404);
    }
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
    if (code === "ENOENT") {
      return apiError("NOT_FOUND", "Not found", 404);
    }
    throw e;
  }
}
