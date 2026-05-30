import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { checkNotificationApiRateLimit } from "@/src/lib/rate-limit";
import { prisma } from "@/src/lib/prisma";
import { notificationPriorityToApi } from "@/src/lib/notification-priority-api";
import { notificationReferenceTypeToApi } from "@/src/lib/notification-reference-api";
import { invalidateCacheByTag } from "@/src/lib/cache/cache-utils";
import { notificationsUserTagKey } from "@/src/lib/cache/cache-keys";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/notifications/[id]/read — mark a notification as read for the authenticated user.
 * Only updates if the notification exists and belongs to the user.
 * Response: `{ id, title, message, priority, referenceId, referenceType, isRead, createdAt }` (same shape as list items).
 */
export async function PATCH(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitRes = checkNotificationApiRateLimit(userId);
  if (rateLimitRes) return rateLimitRes;

  const { id } = await context.params;
  if (!id || id.trim() === "") {
    return apiError("VALIDATION_ERROR", "Missing notification id", 400);
  }

  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });

  if (result.count === 0) {
    return apiError("NOT_FOUND", "Notification not found", 404);
  }

  // Best-effort cache invalidation (unread count + pages).
  await invalidateCacheByTag(notificationsUserTagKey(userId), 1_000);

  const row = await prisma.notification.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      message: true,
      priority: true,
      referenceId: true,
      referenceType: true,
      isRead: true,
      createdAt: true,
    },
  });

  if (!row) {
    return apiError("NOT_FOUND", "Notification not found", 404);
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    message: row.message,
    priority: notificationPriorityToApi(row.priority),
    referenceId: row.referenceId,
    referenceType: notificationReferenceTypeToApi(row.referenceType),
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  });
}
