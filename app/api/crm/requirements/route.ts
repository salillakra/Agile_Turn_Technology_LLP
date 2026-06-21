import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { apiError } from "@/src/lib/api-error-response";
import { canManageCrm, canViewCrm } from "@/src/lib/crm/crm-rbac";
import { buildCrmRequirementVisibilityWhere } from "@/src/lib/crm/crm-scope";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/crm/requirements */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCrm);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const userId = auth.session.user?.id;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const scope = buildCrmRequirementVisibilityWhere(role, userId);
  const where = {
    ...scope,
    ...(clientId && isValidCuid(clientId) ? { clientId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.crmRequirement.count({ where }),
    prisma.crmRequirement.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        job: { select: { id: true, title: true, status: true } },
        _count: { select: { submissions: true, closures: true } },
      },
    }),
  ]);

  return NextResponse.json({ data: rows, page, limit, total });
}

/** POST /api/crm/requirements */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canManageCrm);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.session.user?.id;
  if (typeof userId !== "string") return apiError("UNAUTHORIZED", "Not signed in", 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!clientId || !isValidCuid(clientId)) return apiError("VALIDATION_ERROR", "Valid clientId is required", 400);
  if (!title) return apiError("VALIDATION_ERROR", "title is required", 400);

  const client = await prisma.crmClient.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return apiError("NOT_FOUND", "Client not found", 404);

  const requirement = await prisma.crmRequirement.create({
    data: {
      clientId,
      title,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      headcount: Number.isInteger(body.headcount) ? Number(body.headcount) : 1,
      feeType: typeof body.feeType === "string" ? body.feeType.trim() || null : null,
      feeAmount: body.feeAmount != null && body.feeAmount !== "" ? Number(body.feeAmount) : null,
      currency: typeof body.currency === "string" ? body.currency.trim() || "INR" : "INR",
      department: typeof body.department === "string" ? body.department.trim() || null : null,
      location: typeof body.location === "string" ? body.location.trim() || null : null,
      createdById: userId,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(requirement, { status: 201 });
}
