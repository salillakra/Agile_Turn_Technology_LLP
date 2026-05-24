import { NextResponse } from "next/server";
import { getSession } from "./auth";
import type { Session } from "next-auth";

/**
 * Use in API Route Handlers to enforce auth and optional role check.
 * - No session → 401 Unauthorized
 * - Session exists but check(role) is false → 403 Forbidden
 * - Otherwise returns { session } so the route can proceed.
 * Pass a predicate from rbac.ts, e.g. (role) => canDeleteJob(role).
 */
export async function requireApiAuth(
  check?: (role: string) => boolean
): Promise<{ session: Session } | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user?.role ?? "";
  if (check && !check(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { session };
}
