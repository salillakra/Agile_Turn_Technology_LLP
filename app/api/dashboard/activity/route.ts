import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { apiError } from "@/src/lib/api-error-response";
import {
  dashboardDatabaseError,
  requireDashboardAuth,
} from "@/src/lib/dashboard-api";
import {
  DASHBOARD_API_ENDPOINT,
  withDashboardTelemetry,
} from "@/src/lib/dashboard-telemetry";
import {
  consumeDashboardRateLimit,
  dashboardRateLimitedResponse,
} from "@/src/lib/dashboard-rate-limit";
import { dashboardActivityFeedKey } from "@/src/lib/cache/cache-keys";
import { getCache, readPositiveIntEnv, setCache } from "@/src/lib/cache/cache-utils";

const ENDPOINT = DASHBOARD_API_ENDPOINT.activity;

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

function parseActivityLimit(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));
}

/** GET /api/dashboard/activity
 * Rate limit: 60 requests / minute / user (shared across dashboard APIs); 429 + `Retry-After` when exceeded.
 * Responsibility: return dashboard activity/actions feed with cursor pagination.
 * Query: `limit` (default 20, max 100), optional `cursor` — pass `nextCursor` from the previous response to load older logs.
 * Sort: `createdAt` desc, then `id` desc (stable ordering for cursors).
 * Timezone: `createdAt` is returned as stored (ISO in JSON); no server-side business-timezone conversion — use frontend if needed.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) {
    return withDashboardTelemetry(auth, {
      endpoint: ENDPOINT,
      role: "UNKNOWN",
      startedAt,
      cacheHit: "n/a",
      queryTimeMs: 0,
      errorCode: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }
  const role = auth.session.user?.role ?? "UNKNOWN";
  const userId = auth.session.user?.id;
  const isAdmin = role === "ADMIN";

  const rateLimit = await consumeDashboardRateLimit(userId);
  if (rateLimit.ok === false) {
    return withDashboardTelemetry(
      dashboardRateLimitedResponse(rateLimit.retryAfterSeconds),
      {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "n/a",
        queryTimeMs: 0,
        errorCode: "RATE_LIMITED",
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const limitParsed = parseActivityLimit(searchParams.get("limit"));
  if (limitParsed == null) {
    return withDashboardTelemetry(
      apiError(
        "INVALID_LIMIT",
        `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
        400
      ),
      {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "n/a",
        queryTimeMs: 0,
        errorCode: "INVALID_LIMIT",
      }
    );
  }
  const limit = limitParsed;
  const cursor =
    searchParams.get("cursor")?.trim() === ""
      ? undefined
      : searchParams.get("cursor")?.trim();

  const ttlSec = Math.max(1, readPositiveIntEnv("DASHBOARD_ACTIVITY_CACHE_TTL_SEC", 15));
  const canCache = cursor == null;
  const cacheKey = canCache
    ? dashboardActivityFeedKey({ role, userId, limit })
    : null;
  if (canCache && cacheKey) {
    const cached = await getCache<unknown>(cacheKey);
    if (cached.hit && cached.value) {
      return withDashboardTelemetry(NextResponse.json(cached.value), {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: "hit",
        queryTimeMs: 0,
      });
    }
  }

  const dbStartedAt = Date.now();
  try {
    if (cursor != null) {
      const exists = await prisma.activityLog.findUnique({
        where: { id: cursor },
        select: { id: true },
      });
      if (!exists) {
        const queryTimeMs = Date.now() - dbStartedAt;
        return withDashboardTelemetry(
          apiError("INVALID_CURSOR", "cursor does not match any activity log", 400),
          {
            endpoint: ENDPOINT,
            role,
            startedAt,
            cacheHit: "n/a",
            queryTimeMs,
            errorCode: "INVALID_CURSOR",
          }
        );
      }
    }

    const rows = await prisma.activityLog.findMany({
      take: limit + 1,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      where: isAdmin
        ? undefined
        : {
            application: {
              job: {
                assignments: {
                  some: { userId: userId ?? "" },
                },
              },
            },
          },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        action: true,
        details: true,
        applicationId: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;

    const queryTimeMs = Date.now() - dbStartedAt;
    const payload = {
      activity: page.map((log) => ({
        id: log.id,
        action: log.action,
        details: log.details,
        user: log.user,
        applicationId: log.applicationId,
        createdAt: log.createdAt,
      })),
      nextCursor,
      hasMore,
    };

    if (canCache && cacheKey) {
      void setCache(cacheKey, payload, { ttlSec });
    }

    return withDashboardTelemetry(
      NextResponse.json(payload),
      {
        endpoint: ENDPOINT,
        role,
        startedAt,
        cacheHit: canCache ? "miss" : "n/a",
        queryTimeMs,
      }
    );
  } catch (error) {
    const queryTimeMs = Date.now() - dbStartedAt;
    return withDashboardTelemetry(dashboardDatabaseError(error), {
      endpoint: ENDPOINT,
      role,
      startedAt,
      cacheHit: "n/a",
      queryTimeMs,
      errorCode: "DATABASE_ERROR",
    });
  }
}

