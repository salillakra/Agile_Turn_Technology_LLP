import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { checkNotificationApiRateLimit } from "@/src/lib/rate-limit";
import { prisma } from "@/src/lib/prisma";
import { scheduleNotificationFeedUpdated } from "@/src/lib/notification-realtime";

/** PATCH /api/notifications/read-all — mark all notifications for the authenticated user as read. */
export async function PATCH() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitRes = checkNotificationApiRateLimit(userId);
  if (rateLimitRes) return rateLimitRes;

  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  scheduleNotificationFeedUpdated(userId);

  return NextResponse.json({ ok: true, updated: result.count });
}
