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

async function isMonitorReachable(): Promise<boolean> {
  try {
    const res = await fetch(getQueueMonitorHealthUrl(), {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildMonitorApp(): express.Application {
  if (!process.env.NEXTAUTH_SECRET?.trim()) {
    throw new Error("NEXTAUTH_SECRET is required for the queue monitor (same value as the Next.js app).");
  }

  if (!isRedisConfigured()) {
    console.warn(
      "[monitor] Redis is not configured — Bull Board will not show live queue data until REDIS_URL or REDIS_HOST is set."
    );
  } else {
    console.info(`[monitor] redis=${getRedisTargetDescription() ?? "configured"}`);
  }

  const app = express();
  const serverAdapter = createQueueMonitorBoard();

  app.get("/health", (_req, res) => {
    res.json({ ok: true, redis: isRedisConfigured() });
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

  if (await isMonitorReachable()) {
    return { ok: true, origin };
  }

  if (globalThis.__queueMonitorServer) {
    return { ok: true, origin };
  }

  if (!globalThis.__queueMonitorStartPromise) {
    globalThis.__queueMonitorStartPromise = new Promise<void>((resolve, reject) => {
      try {
        const app = buildMonitorApp();
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
