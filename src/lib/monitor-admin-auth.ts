import type { Request, Response, NextFunction } from "express";
import {
  QUEUE_MONITOR_COOKIE,
  verifyQueueMonitorToken,
} from "@/src/lib/queue-monitor-access";

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function extractAccessToken(req: Request): string | undefined {
  const query = req.query.accessToken;
  if (typeof query === "string" && query.length > 0) return query;

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const fromCookie = cookies[QUEUE_MONITOR_COOKIE];
  return typeof fromCookie === "string" && fromCookie.length > 0 ? fromCookie : undefined;
}

function forbiddenHtml(loginUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Queue monitor — forbidden</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;">
  <h1>Queue monitor</h1>
  <p>Admin access required. Sign in as an <strong>ADMIN</strong> user in the main app, then open the monitor from the dashboard or request a new access link.</p>
  <p><a href="${loginUrl}">Sign in</a></p>
</body>
</html>`;
}

/**
 * Express middleware: allow only verified ADMIN monitor tokens.
 * Query `accessToken` is exchanged for an HttpOnly cookie and stripped via redirect.
 */
export function createAdminMonitorAuthMiddleware(basePath: string) {
  const base =
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
  const loginUrl = `${base}/login`;

  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractAccessToken(req);
    const payload = verifyQueueMonitorToken(token);
    if (!payload) {
      // Bull Board UI hits JSON endpoints under `${basePath}/api/*`.
      // Returning HTML there is interpreted as "Internal server error" in the UI.
      // Prefer a JSON 401/403 so the UI can show a clearer auth problem.
      const wantsJson =
        typeof req.headers.accept === "string" && req.headers.accept.includes("application/json");
      const isApi = typeof req.originalUrl === "string" && req.originalUrl.includes(`${basePath}/api/`);
      if (wantsJson || isApi) {
        res.status(401).json({ error: "Unauthorized (missing or invalid queue monitor token)" });
      } else {
        res.status(403).type("html").send(forbiddenHtml(loginUrl));
      }
      return;
    }

    const queryToken = req.query.accessToken;
    if (typeof queryToken === "string" && queryToken.length > 0) {
      res.cookie(QUEUE_MONITOR_COOKIE, queryToken, {
        httpOnly: true,
        maxAge: 60 * 60 * 1000,
        sameSite: "lax",
        path: basePath,
      });
      const cleanPath = req.originalUrl.split("?")[0] || basePath;
      res.redirect(302, cleanPath);
      return;
    }

    next();
  };
}
