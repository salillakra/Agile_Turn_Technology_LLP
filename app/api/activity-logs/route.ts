import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { checkGlobalActivityLogsRateLimit } from "@/src/lib/rate-limit";
import { isValidCuid } from "@/src/lib/validate-id";
import {
  INTERVIEW_ACTIVITY_ACTIONS,
  isInterviewActivityAction,
} from "@/src/lib/activity-log-details";
import { getCache, readPositiveIntEnv, setCache } from "@/src/lib/cache/cache-utils";
import { globalActivityFeedKey } from "@/src/lib/cache/cache-keys";

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
  const actionFilter = searchParams.get("action")?.trim() ?? "";
  const interviewIdFilter = searchParams.get("interviewId")?.trim() ?? "";
  const applicationIdFilter = searchParams.get("applicationId")?.trim() ?? "";

  if (actionFilter && !isInterviewActivityAction(actionFilter)) {
    return apiError(
      "INVALID_ACTION",
      `action must be one of: ${INTERVIEW_ACTIVITY_ACTIONS.join(", ")}`,
      400
    );
  }
  if (interviewIdFilter && !isValidCuid(interviewIdFilter)) {
    return apiError("INVALID_ID", "Malformed interviewId", 400);
  }
  if (applicationIdFilter && !isValidCuid(applicationIdFilter)) {
    return apiError("INVALID_ID", "Malformed applicationId", 400);
  }

  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const ttlSec = Math.max(1, readPositiveIntEnv("ACTIVITY_FEED_CACHE_TTL_SEC", 10));
  const cacheKey = globalActivityFeedKey({
    page,
    limit,
    action: actionFilter || null,
    interviewId: interviewIdFilter || null,
    applicationId: applicationIdFilter || null,
  });
  const cached = await getCache<{ logs: unknown[]; page: number; totalPages: number }>(cacheKey);
  if (cached.hit && cached.value && Array.isArray(cached.value.logs)) {
    return NextResponse.json(cached.value, { headers: { "X-Cache-Activity-Feed": "hit" } });
  }

  const where = {
    ...(applicationIdFilter
      ? { applicationId: applicationIdFilter }
      : { applicationId: { not: null } }),
    ...(interviewIdFilter ? { interviewId: interviewIdFilter } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
  };

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
      interviewId: true,
      interviewerId: true,
      candidateId: true,
      action: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const payload = {
    logs: logs.map((l) => ({
      applicationId: l.applicationId,
      interviewId: l.interviewId,
      interviewerId: l.interviewerId,
      candidateId: l.candidateId,
      action: l.action,
      user: l.user,
      timestamp: l.createdAt,
    })),
    page,
    totalPages,
  };

  void setCache(cacheKey, payload, { ttlSec });

  return NextResponse.json(payload, { headers: { "X-Cache-Activity-Feed": "miss" } });
}

