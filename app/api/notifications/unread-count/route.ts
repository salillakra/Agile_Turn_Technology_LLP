import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { checkNotificationApiRateLimit } from "@/src/lib/rate-limit";
import { prisma } from "@/src/lib/prisma";

/** GET /api/notifications/unread-count — count of unread notifications for the authenticated user.
 * Returns only notifications where isRead = false.
 */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitRes = checkNotificationApiRateLimit(userId);
  if (rateLimitRes) return rateLimitRes;

  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  return NextResponse.json({ count });
}
