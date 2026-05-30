import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { checkNotificationApiRateLimit } from "@/src/lib/rate-limit";
import { prisma } from "@/src/lib/prisma";
import {
  getCache,
  readPositiveIntEnv,
  registerCacheForTags,
  setCache,
} from "@/src/lib/cache/cache-utils";
import {
  notificationsUnreadCountKey,
  notificationsUserTagKey,
} from "@/src/lib/cache/cache-keys";

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

  const ttlSec = Math.max(1, readPositiveIntEnv("NOTIFICATIONS_UNREAD_CACHE_TTL_SEC", 15));
  const cacheKey = notificationsUnreadCountKey(userId);
  const cached = await getCache<{ count: number; cachedAt: string }>(cacheKey);
  if (cached.hit && typeof cached.value?.count === "number") {
    return NextResponse.json(
      { count: cached.value.count },
      { headers: { "X-Cache-Notifications-Unread": "hit" } }
    );
  }

  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  const payload = { count, cachedAt: new Date().toISOString() };
  const { ok } = await setCache(cacheKey, payload, { ttlSec });
  if (ok) {
    await registerCacheForTags(cacheKey, [notificationsUserTagKey(userId)], ttlSec);
  }

  return NextResponse.json(
    { count },
    { headers: { "X-Cache-Notifications-Unread": "miss" } }
  );
}
