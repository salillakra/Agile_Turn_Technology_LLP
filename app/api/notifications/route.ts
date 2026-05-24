import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { checkNotificationApiRateLimit } from "@/src/lib/rate-limit";
import { prisma } from "@/src/lib/prisma";
import { notificationPriorityToApi } from "@/src/lib/notification-priority-api";
import { notificationReferenceTypeToApi } from "@/src/lib/notification-reference-api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/notifications — paginated list for the authenticated user.
 * Rate limit: 60 requests/min per user (shared with other notification APIs); 429 when exceeded.
 * Query: `page` (default 1, min 1), `limit` (default 20, min 1, max 100).
 * Sort: `createdAt` descending (newest first).
 * Response: `{ notifications, page, limit, total, totalPages }` — each item has `id`, `type`, `title`, `message`, `priority` (`"low"` \| `"medium"` \| `"high"` \| null), `referenceId`, `referenceType` (`"application"` \| `"candidate"` \| null), `isRead`, `createdAt`.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitRes = checkNotificationApiRateLimit(userId);
  if (rateLimitRes) return rateLimitRes;

  const { searchParams } = new URL(request.url);
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");

  const page = Math.max(1, parseInt(String(pageRaw ?? "1"), 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(String(limitRaw ?? String(DEFAULT_LIMIT)), 10) || DEFAULT_LIMIT)
  );

  const total = await prisma.notification.count({ where: { userId } });
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  if (totalPages > 0 && page > totalPages) {
    return NextResponse.json({
      notifications: [],
      page,
      limit,
      total,
      totalPages,
    });
  }

  const skip = (page - 1) * limit;

  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      priority: true,
      referenceId: true,
      referenceType: true,
      isRead: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      priority: notificationPriorityToApi(n.priority),
      referenceId: n.referenceId,
      referenceType: notificationReferenceTypeToApi(n.referenceType),
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    page,
    limit,
    total,
    totalPages,
  });
}
