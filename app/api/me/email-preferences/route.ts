import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import {
  getEmailPreferencesForUser,
  upsertEmailPreferences,
} from "@/src/lib/email/email-preference-service";
import { prisma } from "@/src/lib/prisma";

/**
 * GET /api/me/email-preferences — current user's email channel settings (no UI yet).
 * PATCH — update stage updates, interview reminders, marketing emails.
 */

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (typeof userId !== "string") {
    return apiError("UNAUTHORIZED", "Not signed in", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return apiError("NOT_FOUND", "User not found", 404);

  const prefs =
    (await getEmailPreferencesForUser(userId)) ??
    (await upsertEmailPreferences({
      email: user.email,
      userId,
    }));

  return NextResponse.json(prefs);
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (typeof userId !== "string") {
    return apiError("UNAUTHORIZED", "Not signed in", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return apiError("NOT_FOUND", "User not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Parameters<typeof upsertEmailPreferences>[0] = {
    email: user.email,
    userId,
  };

  if (typeof body.stageUpdates === "boolean") {
    patch.stageUpdates = body.stageUpdates;
  }
  if (typeof body.interviewReminders === "boolean") {
    patch.interviewReminders = body.interviewReminders;
  }
  if (typeof body.marketingEmails === "boolean") {
    patch.marketingEmails = body.marketingEmails;
  }

  const updated = await upsertEmailPreferences(patch);
  return NextResponse.json(updated);
}
