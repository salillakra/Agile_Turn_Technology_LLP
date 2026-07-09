import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canInviteUsers } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/prisma";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { getEmailBrand } from "@/src/lib/email/templates/brand";

const INVITE_EXPIRY_DAYS = 7;
const ALLOWED_ROLES = ["ADMIN", "RECRUITER", "HIRING_MANAGER"] as const;

/**
 * POST /api/invites — Create an invite and send the invite email.
 * Requires ADMIN role.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canInviteUsers);
  if (auth instanceof NextResponse) return auth;

  const session = auth.session;
  const body = await request.json();
  const { email, role: roleInput } = body as { email?: string; role?: string };

  if (!email || typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Validate role
  const role = ALLOWED_ROLES.includes(roleInput as (typeof ALLOWED_ROLES)[number])
    ? (roleInput as (typeof ALLOWED_ROLES)[number])
    : null;
  if (!role) {
    return NextResponse.json(
      { error: "Role must be one of: ADMIN, RECRUITER, HIRING_MANAGER." },
      { status: 400 }
    );
  }

  // Check if user already exists with this email
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: trimmedEmail, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: "A user with this email already exists." },
      { status: 409 }
    );
  }

  // Check for an existing unused, non-expired invite
  const existingInvite = await prisma.userInvite.findFirst({
    where: {
      email: trimmedEmail,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInvite) {
    return NextResponse.json(
      { error: "An active invite already exists for this email. It expires " + existingInvite.expiresAt.toISOString() + "." },
      { status: 409 }
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  const invite = await prisma.userInvite.create({
    data: {
      email: trimmedEmail,
      role,
      expiresAt,
      invitedBy: session.user.id,
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // Send the invite email
  const brand = getEmailBrand();
  const inviteUrl = `${brand.appUrl}/invite/${invite.token}`;

  try {
    await enqueueEmailJob({
      recipient: trimmedEmail,
      subject: `You've been invited to join ${brand.productName}`,
      template: "user_invite",
      data: {
        inviterName: session.user.name || "An administrator",
        role,
        inviteUrl,
        expiresInDays: INVITE_EXPIRY_DAYS,
      },
    });
  } catch (emailErr) {
    // Don't fail the invite creation if email fails — the link is still valid
    console.error("[invites] Failed to enqueue invite email:", emailErr);
  }

  return NextResponse.json(
    { ...invite, inviteUrl },
    { status: 201 }
  );
}

/**
 * GET /api/invites — List invites (ADMIN only).
 */
export async function GET() {
  const auth = await requireApiAuth(canInviteUsers);
  if (auth instanceof NextResponse) return auth;

  const invites = await prisma.userInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
      inviter: {
        select: { name: true, email: true },
      },
    },
  });

  // Add computed status
  const now = new Date();
  const data = invites.map((inv) => ({
    ...inv,
    status: inv.usedAt
      ? "used"
      : inv.expiresAt < now
        ? "expired"
        : "pending",
  }));

  return NextResponse.json({ data });
}
