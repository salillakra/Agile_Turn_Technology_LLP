import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import {
  buildAvatarStoredFileName,
  validateAvatarFile,
} from "@/src/lib/avatar-upload-validation";
import {
  ensureProfileMediaDir,
  getProfileMediaDir,
  PROFILE_MEDIA_READ_PREFIX,
  tryRemoveProfileMediaFile,
} from "@/src/lib/profile-media-storage";
import { loadProfileForUser, profileWithCompleteness } from "@/src/lib/user-profile-api";

export const runtime = "nodejs";

/**
 * POST /api/profile/upload-avatar — multipart field `file` (JPEG, PNG, WebP, max 2MB).
 * Sets `User.image` to `/api/profile/media/{fileName}` and stores `avatarFileName` on profile.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : "";
  if (!userId) return apiError("UNAUTHORIZED", "Invalid session", 401);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return apiError(
      "INVALID_CONTENT_TYPE",
      'Expected multipart/form-data with a file field named "file".',
      400
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("BAD_REQUEST", "Could not parse multipart body.", 400);
  }

  const entry = formData.get("file");
  if (entry == null || typeof entry === "string") {
    return apiError("VALIDATION_ERROR", 'Missing file field "file".', 400);
  }

  const file = entry as File;
  const mimeType = typeof file.type === "string" ? file.type : "";

  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateAvatarFile({ mimeType, buffer });
  if (validated.ok === false) {
    return apiError(validated.code, validated.message, 400);
  }

  ensureProfileMediaDir();
  const storedName = buildAvatarStoredFileName(validated.ext);
  const absolutePath = path.join(getProfileMediaDir(), storedName);
  const publicPath = `${PROFILE_MEDIA_READ_PREFIX}${encodeURIComponent(storedName)}`;

  const prev = await prisma.userProfile.findUnique({
    where: { userId },
    select: { avatarFileName: true },
  });
  const previousAvatar = prev?.avatarFileName;

  try {
    await writeFile(absolutePath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Write failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[profile/upload-avatar] writeFile", e);
    }
    return apiError("WRITE_FAILED", "Could not save image to disk.", 500, { reason: msg });
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { image: publicPath },
      }),
      prisma.userProfile.upsert({
        where: { userId },
        create: { userId, avatarFileName: storedName },
        update: { avatarFileName: storedName },
      }),
    ]);
  } catch (e) {
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(absolutePath);
    } catch {
      // ignore
    }
    throw e;
  }

  await tryRemoveProfileMediaFile(previousAvatar);

  const user = await loadProfileForUser(userId);
  if (!user) return apiError("NOT_FOUND", "User not found", 404);

  return NextResponse.json(profileWithCompleteness(user), { status: 201 });
}
