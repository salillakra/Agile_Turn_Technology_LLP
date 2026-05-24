import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/src/lib/prisma";

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
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
      (typeof request.headers.get === "function" ? new URL(request.url).origin : "");
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    if (process.env.NODE_ENV === "development") {
      console.info(`[forgot-password] Reset link for ${user.email}: ${resetUrl}`);
    }

    // Future: send email via Resend / SendGrid using process.env.SMTP_* or RESEND_API_KEY
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ ok: true, devResetUrl: resetUrl });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[forgot-password]", e);
    return NextResponse.json({ ok: true });
  }
}
