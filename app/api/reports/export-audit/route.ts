import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/src/lib/dashboard-api";
import { prisma } from "@/src/lib/prisma";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/reports/export-audit
 * Lists recent report export downloads for compliance review.
 * ADMIN: all users' exports. RECRUITER / HIRING_MANAGER: own exports only.
 * Query: limit (default 50, max 100).
 */
export async function GET(request: Request) {
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) return auth;

  const { session } = auth;
  const role = session.user?.role ?? "";
  const userId = typeof session.user?.id === "string" ? session.user.id.trim() : "";

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );

  const isAdmin = role === "ADMIN";
  if (!isAdmin && !userId) {
    return NextResponse.json({ data: [], limit }, { status: 200 });
  }

  const rows = await prisma.reportExportLog.findMany({
    where: isAdmin ? {} : { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      role: true,
      format: true,
      exportType: true,
      reportRange: true,
      jobId: true,
      department: true,
      rowCount: true,
      createdAt: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({ data: rows, limit });
}
