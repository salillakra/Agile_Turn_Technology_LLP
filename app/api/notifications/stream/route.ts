import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import {
  notificationUserChannel,
  type NotificationRealtimePayload,
} from "@/src/lib/notification-realtime";
import { isRedisConfigured } from "@/src/lib/redis-config";
import { createRedisClient } from "@/src/lib/redis-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

function encodeSse(event: string, data?: unknown): Uint8Array {
  const encoder = new TextEncoder();
  const lines = [`event: ${event}`];
  if (data !== undefined) {
    lines.push(`data: ${JSON.stringify(data)}`);
  }
  lines.push("", "");
  return encoder.encode(lines.join("\n"));
}

/**
 * GET /api/notifications/stream — SSE feed for in-app notification updates.
 * Publishes are triggered by {@link notifyNotificationFeedUpdated} on writes.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "Realtime unavailable" }, { status: 503 });
  }

  const subscriber = createRedisClient({ purpose: "default", optional: true });
  if (!subscriber) {
    return NextResponse.json({ error: "Realtime unavailable" }, { status: 503 });
  }

  const channel = notificationUserChannel(userId);
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    subscriber.removeAllListeners("message");
    subscriber.removeAllListeners("error");
    void subscriber.unsubscribe(channel).catch(() => {});
    void subscriber.quit().catch(() => {
      try {
        subscriber.disconnect();
      } catch {
        /* ignore */
      }
    });
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: string, data?: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encodeSse(event, data));
        } catch {
          cleanup();
        }
      };

      push("connected", { ok: true });

      heartbeatTimer = setInterval(() => push("ping"), HEARTBEAT_MS);

      subscriber.on("message", (receivedChannel, message) => {
        if (closed || receivedChannel !== channel) return;
        try {
          const payload = JSON.parse(message) as NotificationRealtimePayload;
          push("notification", payload);
        } catch {
          push("notification", { type: "updated" });
        }
      });

      subscriber.on("error", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });

      void subscriber.subscribe(channel).catch(() => {
        cleanup();
        try {
          controller.error(new Error("Failed to subscribe"));
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
