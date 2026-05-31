import crypto from "node:crypto";
import { isAdmin } from "@/src/lib/rbac";

/** Bull Board UI mount path (must match Express `app.use` and monitor rewrites). */
export const QUEUE_MONITOR_BASE_PATH = "/admin/queues";

/** Signed monitor session cookie (Bull Board sidecar). */
export const QUEUE_MONITOR_COOKIE = "queue-monitor-session";

const TOKEN_TTL_MS = 60 * 60 * 1000;

export type QueueMonitorTokenPayload = {
  sub: string;
  role: string;
  exp: number;
};

function monitorSigningSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to sign queue monitor access tokens");
  }
  return secret;
}

/** HMAC-signed token; only issued for ADMIN via `/api/admin/queue-monitor/access`. */
export function signQueueMonitorToken(params: { userId: string; role: string }): string {
  if (!isAdmin(params.role)) {
    throw new Error("Queue monitor access requires ADMIN role");
  }
  const body: QueueMonitorTokenPayload = {
    sub: params.userId,
    role: params.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const json = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", monitorSigningSecret()).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function verifyQueueMonitorToken(
  token: string | undefined | null
): QueueMonitorTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const json = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!json || !sig) return null;

  let secret: string;
  try {
    secret = monitorSigningSecret();
  } catch {
    return null;
  }

  const expected = crypto.createHmac("sha256", secret).update(json).digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(json, "base64url").toString("utf8")
    ) as QueueMonitorTokenPayload;
    if (!isAdmin(payload.role) || typeof payload.sub !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getQueueMonitorPublicOrigin(): string {
  const explicit = process.env.QUEUE_MONITOR_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const port = process.env.QUEUE_MONITOR_PORT?.trim() || "3030";
  return `http://127.0.0.1:${port}`;
}

/**
 * Internal origin used for reachability checks between processes.
 * Must point directly at the monitor HTTP server (never Next.js rewrites).
 */
export function getQueueMonitorInternalOrigin(): string {
  const port = process.env.QUEUE_MONITOR_PORT?.trim() || "3030";
  return `http://127.0.0.1:${port}`;
}
