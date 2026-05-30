import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/src/lib/prisma";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";

/**
 * POST /api/auth/reset-password
 * Body: { token: string, password: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const cfg = readRateLimitConfig({
      maxEnv: "AUTH_RESET_PASSWORD_RATE_MAX",
      windowMsEnv: "AUTH_RESET_PASSWORD_RATE_WINDOW_MS",
      defaultMax: 10,
      defaultWindowMs: 60_000,
    });
    const limited = await consumeApiRateLimit({
      prefix: "recruitment:auth:ratelimit:v1:",
      scope: "reset-password",
      identity: token.slice(0, 24),
      max: cfg.max,
      windowMs: cfg.windowMs,
    });
    if (limited.ok === false) {
      return rateLimitedResponse({
        message: "Too many password reset attempts. Try again later.",
        retryAfterSeconds: limited.retryAfterSeconds,
        limit: cfg.max,
        windowSeconds: Math.round(cfg.windowMs / 1000),
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired reset link. Request a new one from the login page." },
        { status: 400 }
      );
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reset-password]", e);
    return NextResponse.json({ error: "Reset failed." }, { status: 500 });
  }
}
