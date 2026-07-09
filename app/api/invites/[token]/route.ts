import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/src/lib/prisma";

/**
 * GET /api/invites/[token] — Public. Validate an invite token.
 * Returns { valid, email, role } or { valid: false, reason }.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { valid: false, reason: "Missing token." },
      { status: 400 }
    );
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json(
      { valid: false, reason: "Invite not found." },
      { status: 404 }
    );
  }

  if (invite.usedAt) {
    return NextResponse.json(
      { valid: false, reason: "This invite has already been used." },
      { status: 410 }
    );
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { valid: false, reason: "This invite has expired. Please ask your admin for a new one." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    role: invite.role,
  });
}

/**
 * POST /api/invites/[token] — Public. Accept an invite and create user account.
 * Body: { name: string, password: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const body = await request.json();
  const { name, password } = body as { name?: string; password?: string };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  if (invite.usedAt) {
    return NextResponse.json(
      { error: "This invite has already been used." },
      { status: 410 }
    );
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired." },
      { status: 410 }
    );
  }

  // Check if a user already exists with this email
  const existing = await prisma.user.findFirst({
    where: { email: { equals: invite.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    // Mark invite as used anyway
    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    return NextResponse.json(
      { error: "A user with this email already exists. Please sign in instead." },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user and mark invite as used in a transaction
  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: name.trim(),
        email: invite.email,
        password: hashedPassword,
        role: invite.role,
        profile: { create: {} },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json(user, { status: 201 });
}
