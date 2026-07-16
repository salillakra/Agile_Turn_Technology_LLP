import { NextResponse } from "next/server";

/**
 * POST /api/auth/register
 *
 * Open registration is disabled. Users must be invited by an admin.
 * The /invite/[token] flow handles account creation.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Registration is invite-only. Ask an admin for an invite link to create your account.",
    },
    { status: 403 }
  );
}
