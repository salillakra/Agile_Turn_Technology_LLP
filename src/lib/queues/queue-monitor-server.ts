/**
 * Bull Board sidecar (Express on QUEUE_MONITOR_PORT, default 3030).
 * Started automatically in development via instrumentation + access route.
 */

import type { Server } from "node:http";
import express from "express";
import {
  createQueueMonitorBoard,
  QUEUE_MONITOR_BASE_PATH,
} from "@/src/lib/queues/bull-board-setup";
import { createAdminMonitorAuthMiddleware } from "@/src/lib/monitor-admin-auth";
import {
  getQueueMonitorInternalOrigin,
  getQueueMonitorPublicOrigin,
} from "@/src/lib/queue-monitor-access";
import { isRedisConfigured, getRedisTargetDescription } from "@/src/lib/queues/redis";
import { pingRedisConfig } from "@/src/lib/redis-ping";
import {
  closeBullBoardQueues,
  getBullBoardQueueCount,
} from "@/src/lib/queues/bull-board-queues";
import { listBullMqQueueNames } from "@/src/lib/queues/queue-names";

declare global {
  // eslint-disable-next-line no-var
  var __queueMonitorServer: Server | undefined;
  // eslint-disable-next-line no-var
  var __queueMonitorStartPromise: Promise<void> | undefined;
}

export function getQueueMonitorPort(): number {
  return Number(process.env.QUEUE_MONITOR_PORT ?? "3030");
}

export function getQueueMonitorHealthUrl(): string {
  const origin = getQueueMonitorInternalOrigin();
  return `${origin}/health`;
}

type MonitorHealthBody = {
  ok?: boolean;
  redis?: boolean;
  redisReachable?: boolean;
  queueCount?: number;
};

async function fetchMonitorHealth(): Promise<MonitorHealthBody | null> {
  try {
    const res = await fetch(getQueueMonitorHealthUrl(), {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as MonitorHealthBody;
  } catch {
    return null;
  }
}

async function isMonitorReachable(): Promise<boolean> {
  const health = await fetchMonitorHealth();
  return health?.ok === true;
}

/** True when an existing monitor was started without Redis or without queues. */
async function monitorNeedsRebuild(): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  const ping = await pingRedisConfig(3000);
  if (!ping.ok) return false;

  const health = await fetchMonitorHealth();
  if (!health?.ok) return false;

  const expectedQueues = listBullMqQueueNames().length;
  const queueCount = typeof health.queueCount === "number" ? health.queueCount : 0;

  if (health.redisReachable === false) return true;
  if (queueCount === 0 && expectedQueues > 0) return true;
  return false;
}

async function closeQueueMonitorServer(): Promise<void> {
  await closeBullBoardQueues();
  const server = globalThis.__queueMonitorServer;
  globalThis.__queueMonitorServer = undefined;
  globalThis.__queueMonitorStartPromise = undefined;
  if (!server) return;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function buildMonitorApp(): Promise<express.Application> {
  if (!process.env.NEXTAUTH_SECRET?.trim()) {
    throw new Error("NEXTAUTH_SECRET is required for the queue monitor (same value as the Next.js app).");
  }

  let redisReachable = false;
  if (!isRedisConfigured()) {
    console.warn(
      "[monitor] Redis is not configured — Bull Board will not show live queue data until REDIS_URL or REDIS_HOST is set."
    );
  } else {
    console.info(`[monitor] redis=${getRedisTargetDescription() ?? "configured"}`);
    const ping = await pingRedisConfig();
    redisReachable = ping.ok;
    if (!ping.ok) {
      console.warn(
        "[monitor] Redis ping failed — Bull Board will load without live queues:",
        ping.error ?? "unknown"
      );
    }
  }

  const app = express();
  const serverAdapter = createQueueMonitorBoard({ redisReachable });

  app.get("/health", async (_req, res) => {
    const configured = isRedisConfigured();
    const ping = configured ? await pingRedisConfig(2000) : { ok: false as const };
    res.json({
      ok: true,
      redis: configured,
      redisReachable: ping.ok,
      redisTarget: ping.ok ? ping.target : undefined,
      redisError: ping.ok ? undefined : ping.error,
      queueCount: ping.ok ? getBullBoardQueueCount() : 0,
    });
  });

  app.use(QUEUE_MONITOR_BASE_PATH, createAdminMonitorAuthMiddleware(QUEUE_MONITOR_BASE_PATH));
  app.use(QUEUE_MONITOR_BASE_PATH, serverAdapter.getRouter());
  // Log and surface Bull Board internal errors (helps diagnose 500 toasts).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[monitor] unhandled error:", e.stack || e.message);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error", message: e.message });
  });

  return app;
}

/**
 * Start the monitor HTTP server once per Node process (dev auto-start + `npm run monitor`).
 */
export async function ensureQueueMonitorServerStarted(): Promise<{
  ok: boolean;
  origin: string;
  error?: string;
}> {
  const origin = getQueueMonitorPublicOrigin();

  if (await monitorNeedsRebuild()) {
    console.info("[monitor] Rebuilding monitor (Redis recovered or queues were not loaded).");
    await closeQueueMonitorServer();
  }

  if (await isMonitorReachable()) {
    const health = await fetchMonitorHealth();
    if (health?.redisReachable !== false && (health?.queueCount ?? 0) > 0) {
      return { ok: true, origin };
    }
    if (!isRedisConfigured()) {
      return { ok: true, origin };
    }
    await closeQueueMonitorServer();
  }

  if (globalThis.__queueMonitorServer) {
    return { ok: true, origin };
  }

  if (!globalThis.__queueMonitorStartPromise) {
    globalThis.__queueMonitorStartPromise = new Promise<void>((resolve, reject) => {
      try {
        void buildMonitorApp()
          .then((app) => {
            const port = getQueueMonitorPort();
            const server = app.listen(port, "127.0.0.1", () => {
              console.info(
                `[monitor] Bull Board listening on http://127.0.0.1:${port}${QUEUE_MONITOR_BASE_PATH}`
              );
              resolve();
            });
            server.on("error", (err: NodeJS.ErrnoException) => {
              if (err.code === "EADDRINUSE") {
                void isMonitorReachable().then((reachable) => {
                  if (reachable) {
                    console.info(
                      `[monitor] Port ${port} already in use — reusing existing monitor at ${origin}.`
                    );
                    resolve();
                    return;
                  }
                  reject(
                    new Error(
                      `Port ${port} is in use but /health did not respond. Stop the other process or set QUEUE_MONITOR_PORT.`
                    )
                  );
                });
                return;
              }
              reject(err);
            });
            globalThis.__queueMonitorServer = server;
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  try {
    await globalThis.__queueMonitorStartPromise;
    const reachable = await isMonitorReachable();
    if (!reachable) {
      return {
        ok: false,
        origin,
        error: `Queue monitor did not become reachable at ${origin}.`,
      };
    }
    return { ok: true, origin };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, origin, error: message };
  }
}

/** CLI entry (`npm run monitor`). Keeps the process alive so the HTTP server stays up. */
export async function runQueueMonitorServerCli(): Promise<void> {
  const result = await ensureQueueMonitorServerStarted();
  if (!result.ok) {
    console.error("[monitor] failed to start:", result.error);
    process.exit(1);
  }
  const port = getQueueMonitorPort();
  console.info(
    `[monitor] Running at http://127.0.0.1:${port}${QUEUE_MONITOR_BASE_PATH} — obtain an ADMIN link from the app (Queue monitor) or GET /api/admin/queue-monitor/access`
  );

  const server = globalThis.__queueMonitorServer;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.once("close", () => resolve());
      server.once("error", (err) => reject(err));
    });
    return;
  }

  // Another process already owns the port (e.g. Next auto-start); block until Ctrl+C.
  const keepAlive = setInterval(() => {}, 60_000);
  await new Promise<void>(() => {
    process.on("SIGINT", () => {
      clearInterval(keepAlive);
      process.exit(0);
    });
  });
}
