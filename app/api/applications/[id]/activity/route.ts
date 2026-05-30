import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { prisma } from "@/src/lib/prisma";
import { parseActivityLogDetails } from "@/src/lib/activity-log-parse";
import { getCache, readPositiveIntEnv, setCache } from "@/src/lib/cache/cache-utils";
import { applicationActivityFeedKey } from "@/src/lib/cache/cache-keys";

type RouteContext = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/applications/[id]/activity — fetch ActivityLog entries for an application. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return apiError("VALIDATION_ERROR", "Missing id", 400);
  if (!isValidCuid(id)) return apiError("INVALID_ID", "Malformed ID format", 400);

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true, jobId: true },
  });

  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }
  if (!(await canAccessJobByScope(role, userId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application", 403);
  }

  const { searchParams } = new URL(_request.url);
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");

  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const limitParsed = Math.max(
    1,
    parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  );

  if (limitParsed > MAX_LIMIT) {
    return apiError("LIMIT_EXCEEDED", "Maximum limit is 100", 400);
  }

  const limit = limitParsed;
  const offset = (page - 1) * limit;

  const ttlSec = Math.max(1, readPositiveIntEnv("ACTIVITY_FEED_CACHE_TTL_SEC", 10));
  const cacheKey = applicationActivityFeedKey({ applicationId: id, page, limit });
  const cached = await getCache<{ logs: unknown[]; page: number; totalPages: number }>(cacheKey);
  if (cached.hit && cached.value && Array.isArray(cached.value.logs)) {
    return NextResponse.json(cached.value, { headers: { "X-Cache-Application-Activity": "hit" } });
  }

  const totalLogs = await prisma.activityLog.count({
    where: { applicationId: id },
  });
  const totalPages = totalLogs === 0 ? 0 : Math.ceil(totalLogs / limit);

  const logs = await prisma.activityLog.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      action: true,
      applicationId: true,
      interviewId: true,
      interviewerId: true,
      candidateId: true,
      details: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const payload = {
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      applicationId: l.applicationId,
      interviewId: l.interviewId,
      interviewerId: l.interviewerId,
      candidateId: l.candidateId,
      details: parseActivityLogDetails(l.details),
      createdAt: l.createdAt,
      user: l.user,
    })),
    page,
    totalPages,
  };

  void setCache(cacheKey, payload, { ttlSec });

  return NextResponse.json(payload, { headers: { "X-Cache-Application-Activity": "miss" } });
}

