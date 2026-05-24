import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { checkGlobalActivityLogsRateLimit } from "@/src/lib/rate-limit";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/activity-logs — global recent ActivityLog feed across all applications. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const rateLimitRes = checkGlobalActivityLogsRateLimit(session.user?.id);
  if (rateLimitRes) return rateLimitRes;

  const { searchParams } = new URL(request.url);
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");

  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const where = { applicationId: { not: null } as const };

  const totalLogs = await prisma.activityLog.count({ where });
  const totalPages = totalLogs === 0 ? 0 : Math.ceil(totalLogs / limit);

  if (totalPages > 0 && page > totalPages) {
    // Keep behavior predictable: empty list instead of throwing.
    return NextResponse.json({ logs: [], page, totalPages });
  }

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      applicationId: true,
      action: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      applicationId: l.applicationId as string,
      action: l.action,
      user: l.user,
      timestamp: l.createdAt,
    })),
    page,
    totalPages,
  });
}

