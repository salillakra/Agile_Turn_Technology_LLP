import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { isAdmin } from "@/src/lib/rbac";
import {
  getQueueMonitorPublicOrigin,
  signQueueMonitorToken,
} from "@/src/lib/queue-monitor-access";
import { QUEUE_MONITOR_BASE_PATH } from "@/src/lib/queues/bull-board-setup";
import { ensureQueueMonitorServerStarted } from "@/src/lib/queues/queue-monitor-server";

export const runtime = "nodejs";

/**
 * Issue a short-lived ADMIN token and monitor URL for Bull Board (separate port/process).
 * Requires an active NextAuth session with role ADMIN.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — ADMIN only" }, { status: 403 });
  }

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

  return NextResponse.json({
    url,
    basePath: QUEUE_MONITOR_BASE_PATH,
    expiresInSeconds: 3600,
  });
}
