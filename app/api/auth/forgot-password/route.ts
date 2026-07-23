import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { prisma } from "@/src/lib/prisma";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";
import { resolveEmailAppUrl } from "@/src/lib/email/templates/brand";

const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 * Always returns 200 with { ok: true } to avoid email enumeration.
 * In development, logs the reset URL to the server console if SMTP is not configured.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!emailRaw) {
      return NextResponse.json({ ok: true });
    }

    const cfg = readRateLimitConfig({
      maxEnv: "AUTH_FORGOT_PASSWORD_RATE_MAX",
      windowMsEnv: "AUTH_FORGOT_PASSWORD_RATE_WINDOW_MS",
      defaultMax: 5,
      defaultWindowMs: 60_000,
    });
    const limited = await consumeApiRateLimit({
      prefix: "recruitment:auth:ratelimit:v1:",
      scope: "forgot-password",
      identity: emailRaw,
      max: cfg.max,
      windowMs: cfg.windowMs,
    });
    if (limited.ok === false) {
      return rateLimitedResponse({
        message: "Too many password reset requests. Try again later.",
        retryAfterSeconds: limited.retryAfterSeconds,
        limit: cfg.max,
        windowSeconds: Math.round(cfg.windowMs / 1000),
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: emailRaw },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_EXPIRY_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });

    const base =
      resolveEmailAppUrl() ||
      (typeof request.headers.get === "function" ? new URL(request.url).origin : "");
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    if (process.env.NODE_ENV === "development") {
      console.info(`[forgot-password] Reset link for ${user.email}: ${resetUrl}`);
    }

    if (isRedisConfigured()) {
      try {
        await enqueueEmailJob(
          {
            recipient: user.email,
            subject: "Reset your password",
            template: "password_reset",
            data: { resetUrl },
          },
          { jobId: `email:password-reset:${user.id}:${token.slice(0, 16)}` }
        );
      } catch (err) {
        console.error("[forgot-password] email enqueue failed", err);
      }
    }

    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ ok: true, devResetUrl: resetUrl });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[forgot-password]", e);
    return NextResponse.json({ ok: true });
  }
}
