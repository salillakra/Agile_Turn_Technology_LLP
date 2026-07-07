import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { isAdmin } from "@/src/lib/rbac";
import {
  getQueueMonitorPublicOrigin,
  QUEUE_MONITOR_BASE_PATH,
  signQueueMonitorToken,
} from "@/src/lib/queue-monitor-access";
import { formatRedisPingFailureHint, pingRedisConfig } from "@/src/lib/redis-ping";
import { isRedisConfigured } from "@/src/lib/queues/redis";

export const runtime = "nodejs";

/**
 * Issue a short-lived ADMIN token and monitor URL for Bull Board (separate port/process).
 * Requires an active NextAuth session with role ADMIN.
 * Not available on Vercel (local sidecar only).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jsonMode = searchParams.get("json") === "true";

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — ADMIN only" }, { status: 403 });
  }

  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error: "Queue monitor is not available on Vercel",
        hint:
          "Bull Board runs as a local sidecar (npm run monitor). Use npm run dev locally for queue inspection, or deploy workers/monitor to Railway/Render.",
      },
      { status: 503 }
    );
  }

  if (isRedisConfigured()) {
    const ping = await pingRedisConfig();
    if (!ping.ok) {
      return NextResponse.json(
        {
          error: "Redis is not reachable — queue monitor cannot load job data",
          code: ping.code,
          redisTarget: ping.target,
          hint: formatRedisPingFailureHint(ping),
        },
        { status: 503 }
      );
    }
  }

  const { ensureQueueMonitorServerStarted } = await import(
    "@/src/lib/queues/queue-monitor-server"
  );

  const started = await ensureQueueMonitorServerStarted();
  if (!started.ok) {
    return NextResponse.json(
      {
        error: started.error ?? "Queue monitor is not running",
        hint:
          "Start it with npm run monitor (or npm run dev:monitor), then try again. In development it should auto-start when Next.js boots.",
      },
      { status: 503 }
    );
  }

  let accessToken: string;
  try {
    accessToken = signQueueMonitorToken({
      userId: session.user.id,
      role: session.user.role,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sign monitor token";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const origin = started.origin || getQueueMonitorPublicOrigin();
  const url = `${origin}${QUEUE_MONITOR_BASE_PATH}?accessToken=${encodeURIComponent(accessToken)}`;

  if (jsonMode) {
    return NextResponse.json({
      url,
      basePath: QUEUE_MONITOR_BASE_PATH,
      expiresInSeconds: 3600,
    });
  }

  return NextResponse.redirect(url);
}
