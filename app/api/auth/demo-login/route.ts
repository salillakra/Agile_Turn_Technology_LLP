import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/src/lib/prisma";
import type { Role } from "@prisma/client";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";

const ROLES: Role[] = ["ADMIN", "RECRUITER", "HIRING_MANAGER"];
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

/**
 * POST /api/auth/demo-login
 * Body: { role: "ADMIN" | "RECRUITER" | "HIRING_MANAGER" }
 *
 * Only active when `ENABLE_DEMO_AUTH=true`. Signs in as the first user found with that role
 * (no password). Intended for demos/staging — do not enable in production with real data.
 * Returns JSON { ok: true } and sets the session cookie; client should navigate to the app.
 */
export async function POST(request: Request) {
  if (process.env.ENABLE_DEMO_AUTH !== "true") {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const cfg = readRateLimitConfig({
    maxEnv: "AUTH_DEMO_LOGIN_RATE_MAX",
    windowMsEnv: "AUTH_DEMO_LOGIN_RATE_WINDOW_MS",
    defaultMax: 30,
    defaultWindowMs: 60_000,
  });
  const identity = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await consumeApiRateLimit({
    prefix: "recruitment:auth:ratelimit:v1:",
    scope: "demo-login",
    identity,
    max: cfg.max,
    windowMs: cfg.windowMs,
  });
  if (limited.ok === false) {
    return rateLimitedResponse({
      message: "Too many demo login requests. Try again later.",
      retryAfterSeconds: limited.retryAfterSeconds,
      limit: cfg.max,
      windowSeconds: Math.round(cfg.windowMs / 1000),
    });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { role: role as Role },
  });

  if (!user) {
    return NextResponse.json(
      { error: "No user with this role. Register at least one account with this role first." },
      { status: 404 }
    );
  }

  const token = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.image ?? undefined,
      id: user.id,
      role: user.role,
      remember: true,
    },
    secret,
    maxAge: MAX_AGE_SEC,
  });

  const secure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  const cookieName = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  const cookie = `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${
    secure ? "; Secure" : ""
  }`;

  const res = NextResponse.json({ ok: true, email: user.email, role: user.role });
  res.headers.append("Set-Cookie", cookie);
  return res;
}
