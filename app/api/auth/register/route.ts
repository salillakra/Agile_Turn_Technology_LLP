import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/src/lib/prisma";
import { consumeApiRateLimit, rateLimitedResponse, readRateLimitConfig } from "@/src/lib/api-rate-limit";

/**
 * POST /api/auth/register
 *
 * Accepts name, email, and password. Hashes the password with bcrypt and stores
 * the user in the database. Returns the created user (without password).
 *
 * Security: Password hashing (see comment below) ensures plain-text passwords
 * are never stored; only the hash is persisted.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, role: roleInput } = body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    const allowedRoles = ["ADMIN", "RECRUITER", "HIRING_MANAGER"] as const;
    const role = allowedRoles.includes(roleInput as (typeof allowedRoles)[number])
      ? (roleInput as (typeof allowedRoles)[number])
      : "RECRUITER";

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required and must be a non-empty string." },
        { status: 400 }
      );
    }
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { error: "Email is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const cfg = readRateLimitConfig({
      maxEnv: "AUTH_REGISTER_RATE_MAX",
      windowMsEnv: "AUTH_REGISTER_RATE_WINDOW_MS",
      defaultMax: 10,
      defaultWindowMs: 60_000,
    });
    const limited = await consumeApiRateLimit({
      prefix: "recruitment:auth:ratelimit:v1:",
      scope: "register",
      identity: trimmedEmail,
      max: cfg.max,
      windowMs: cfg.windowMs,
    });
    if (limited.ok === false) {
      return rateLimitedResponse({
        message: "Too many registration attempts. Try again later.",
        retryAfterSeconds: limited.retryAfterSeconds,
        limit: cfg.max,
        windowSeconds: Math.round(cfg.windowMs / 1000),
      });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password is required and must be at least 8 characters." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }

    /*
     * Password hashing (bcrypt): We never store the raw password. Hashing is one-way:
     * the server can verify a login by comparing the submitted password to the stored
     * hash, but the original password cannot be recovered from the hash. bcrypt also
     * adds a unique salt per password and a cost factor, which protects against
     * rainbow-table and brute-force attacks. If the database is leaked, attackers
     * cannot obtain user passwords from the stored hashes.
     */
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: trimmedEmail,
        password: hashedPassword,
        role,
        profile: { create: {} },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json(
      { error: "Registration failed." },
      { status: 500 }
    );
  }
}
