import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canViewCrm } from "@/src/lib/crm/crm-rbac";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/crm/submissions — candidate submissions linked to requirements. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const requirementId = searchParams.get("requirementId")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const where = requirementId && isValidCuid(requirementId) ? { requirementId } : {};

  const [total, rows] = await Promise.all([
    prisma.crmSubmission.count({ where }),
    prisma.crmSubmission.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { submittedAt: "desc" },
      include: {
        requirement: {
          select: { id: true, title: true, client: { select: { id: true, name: true } } },
        },
        application: {
          include: {
            candidate: { select: { id: true, candidateName: true, email: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({ data: rows, page, limit, total });
}
