import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-error-response";
import { requireDashboardAuth } from "@/src/lib/dashboard-api";
import { isValidCuid } from "@/src/lib/validate-id";
import { getApplicationsCreatedAtFilter, parseDashboardRangeParams, dashboardRangeCacheToken, getDateFilterOptions } from "@/src/lib/dashboard-range";
import { prisma } from "@/src/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getReportsJobScope } from "@/src/lib/reports-job-filter";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { calculateFraction } from "@/src/lib/metrics";
import {
  buildReportsCacheKey,
  getReportsCache,
  setReportsCache,
} from "@/src/lib/reports-cache";
import { withReportsTelemetry } from "@/src/lib/reports-telemetry";
import { scheduleAnalyticsCacheRefresh } from "@/src/lib/enqueue-analytics-refresh";
import { recordReportExport } from "@/src/lib/report-export-audit";

export const runtime = "nodejs";
const MAX_EXPORT_ROWS = 5000;

const exportApplicationSelect = {
  id: true,
  candidateId: true,
  jobId: true,
  stage: true,
  source: true,
  rating: true,
  rejectionReason: true,
  createdAt: true,
  appliedDate: true,
  interviewDate: true,
  offerSentAt: true,
  hiredAt: true,
  lastActivity: true,
  candidate: {
    select: {
      candidateName: true,
      email: true,
      candidateSource: true,
    },
  },
  job: {
    select: {
      title: true,
      department: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

type ExportApplicationRow = Prisma.ApplicationGetPayload<{
  select: typeof exportApplicationSelect;
}>;

function bucketSource(candidateSource: string | null | undefined): "LinkedIn" | "Indeed" | "Referral" | "Website" | "Other" {
  if (candidateSource === "LINKEDIN") return "LinkedIn";
  if (candidateSource === "INDEED") return "Indeed";
  if (candidateSource === "REFERRAL") return "Referral";
  if (
    candidateSource === "COMPANY_WEBSITE" ||
    candidateSource === "GLASSDOOR" ||
    candidateSource === "HEADHUNTER"
  ) {
    return "Website";
  }
  return "Other";
}

async function buildPdfBuffer(linesBuilder: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    linesBuilder(doc);
    doc.end();
  });
}

/** GET /api/reports/export
 * Purpose: export/download report files.
 * Supports query params: `range`, `jobId`, `department`.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireDashboardAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "csv").trim().toLowerCase();
  const wantsXlsx = format === "xlsx";
  const wantsPdf = format === "pdf";
  if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
    return apiError(
      "INVALID_FORMAT",
      "format must be one of: csv, xlsx, pdf",
      400
    );
  }

  const type = (searchParams.get("type")?.trim() || "applications").toLowerCase();
  if (type !== "applications") {
    return apiError(
      "INVALID_TYPE",
      "Only type=applications is supported by this export endpoint",
      400
    );
  }

  const parsedRange = parseDashboardRangeParams(searchParams);
  if (parsedRange == null) {
    return apiError(
      "INVALID_RANGE",
      "range must be one of: 7d, 30d, 90d, all, or custom with dateFrom",
      400
    );
  }

  const jobId = searchParams.get("jobId")?.trim() || "";
  if (jobId !== "" && !isValidCuid(jobId)) {
    return apiError("INVALID_JOB_ID", "Malformed jobId format", 400);
  }

  const department = searchParams.get("department")?.trim() || null;

  const { session } = auth;
  const role = session.user?.role ?? "UNKNOWN";
  const userId = session.user?.id;

  let jobScopeInfo;
  try {
    jobScopeInfo = await getReportsJobScope({
      role,
      userId,
      jobId: jobId || null,
      department,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_JOB_ID") {
      return apiError("INVALID_JOB_ID", "Malformed jobId format", 400);
    }
    throw e;
  }

  const dateFilterOptions = getDateFilterOptions(parsedRange);
  const createdAtFilter = getApplicationsCreatedAtFilter(parsedRange.range, dateFilterOptions);
  const rangeKey = dashboardRangeCacheToken(parsedRange);
  const exportDataCacheKey = buildReportsCacheKey({
    endpoint: "export-data",
    role: String(role),
    userId,
    range: rangeKey,
    jobId,
    department,
    type,
  });

  const where = {
    withdrawnAt: null as null,
    ...(createdAtFilter ? { appliedDate: createdAtFilter } : {}),
    ...(jobScopeInfo.jobIds == null
      ? {}
      : { jobId: { in: jobScopeInfo.jobIds as string[] } }),
  };

  let rows = await getReportsCache<ExportApplicationRow[]>(exportDataCacheKey);
  let cacheHit: "hit" | "miss" = rows == null ? "miss" : "hit";
  const dbStartedAt = Date.now();
  if (rows != null) {
    scheduleAnalyticsCacheRefresh({
      scope: "reports",
      cacheKey: exportDataCacheKey,
      userId: userId ?? undefined,
      role: String(role),
    });
  }
  if (rows == null) {
    rows = await prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: exportApplicationSelect,
    });
    await setReportsCache(exportDataCacheKey, rows);
  }

  if (rows.length > MAX_EXPORT_ROWS) {
    return apiError(
      "EXPORT_TOO_LARGE",
      `Export exceeds ${MAX_EXPORT_ROWS} rows. Narrow filters or range before exporting.`,
      413,
      { rowCount: rows.length, maxRows: MAX_EXPORT_ROWS }
    );
  }

  const auditBase = {
    userId: typeof userId === "string" ? userId : undefined,
    role: String(role),
    exportType: type,
    reportRange: rangeKey,
    jobId,
    department,
    rowCount: rows.length,
  };

  const csvEscape = (value: unknown): string => {
    if (value == null) return "";
    const s = String(value);
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replaceAll('"', '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const header = [
    "applicationId",
    "candidateId",
    "candidateName",
    "candidateEmail",
    "candidateSource",
    "jobId",
    "jobTitle",
    "department",
    "stage",
    "applicationSource",
    "rating",
    "rejectionReason",
    "createdAt",
    "appliedDate",
    "interviewDate",
    "offerSentAt",
    "hiredAt",
    "lastActivity",
  ];

  if (wantsPdf) {
    const totalApplications = rows.length;
    const hiredCount = rows.filter((r) => r.stage === "HIRED").length;
    const rejectedCount = rows.filter((r) => r.stage === "REJECTED").length;
    const offerReachCount = rows.filter((r) => r.stage === "OFFER_SENT" || r.stage === "HIRED").length;
    const totalCandidates = new Set(rows.map((r) => r.candidateId)).size;

    const offerRate = calculateFraction(offerReachCount, totalApplications);
    const conversionRate = calculateFraction(hiredCount, totalApplications);

    const stageOrder = [
      "APPLIED",
      "SCREENING",
      "INTERVIEW",
      "TECHNICAL",
      "FINAL_ROUND",
      "OFFER_SENT",
      "HIRED",
      "REJECTED",
    ] as const;
    const stageCounts = Object.fromEntries(
      stageOrder.map((s) => [s, rows.filter((r) => r.stage === s).length])
    );

    const sourceBuckets: Record<"LinkedIn" | "Indeed" | "Referral" | "Website" | "Other", number> =
      {
        LinkedIn: 0,
        Indeed: 0,
        Referral: 0,
        Website: 0,
        Other: 0,
      };
    for (const r of rows) {
      sourceBuckets[bucketSource(r.candidate.candidateSource ?? null)] += 1;
    }

    const summaryText =
      `In the selected scope, ${totalApplications} applications from ${totalCandidates} unique candidates were processed. ` +
      `Current outcomes show ${hiredCount} hires and ${rejectedCount} rejections. ` +
      `Offer rate is ${(offerRate * 100).toFixed(2)}% and conversion rate is ${(conversionRate * 100).toFixed(2)}%.`;

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await buildPdfBuffer((doc) => {
        doc.fontSize(18).text("Recruitment Report Summary");
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor("#555555").text(
          `Generated: ${new Date().toISOString()}  |  Range: ${rangeKey}  |  Department: ${department || "all"}  |  JobId: ${jobId || "all"}`
        );
        doc.fillColor("#000000");
        doc.moveDown();

        doc.fontSize(13).text("KPIs");
        doc.fontSize(10);
        doc.text(`- Total Jobs: ${jobScopeInfo.totalJobs}`);
        doc.text(`- Total Candidates: ${totalCandidates}`);
        doc.text(`- Total Applications: ${totalApplications}`);
        doc.text(`- Hired Count: ${hiredCount}`);
        doc.text(`- Rejected Count: ${rejectedCount}`);
        doc.text(`- Offer Rate: ${(offerRate * 100).toFixed(2)}%`);
        doc.text(`- Conversion Rate: ${(conversionRate * 100).toFixed(2)}%`);
        doc.moveDown();

        doc.fontSize(13).text("Charts Data (Stage Distribution)");
        doc.fontSize(10);
        for (const stage of stageOrder) {
          doc.text(`- ${stage}: ${stageCounts[stage]}`);
        }
        doc.moveDown();

        doc.fontSize(13).text("Charts Data (Source Distribution)");
        doc.fontSize(10);
        doc.text(`- LinkedIn: ${sourceBuckets.LinkedIn}`);
        doc.text(`- Indeed: ${sourceBuckets.Indeed}`);
        doc.text(`- Referral: ${sourceBuckets.Referral}`);
        doc.text(`- Website: ${sourceBuckets.Website}`);
        doc.text(`- Other: ${sourceBuckets.Other}`);
        doc.moveDown();

        doc.fontSize(13).text("Summary");
        doc.fontSize(10).text(summaryText);
      });
    } catch (pdfErr) {
      const reason = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      if (process.env.NODE_ENV === "development") {
        console.error("[reports/export] PDF generation failed", pdfErr);
      }
      return apiError(
        "PDF_GENERATION_FAILED",
        "Failed to generate PDF export. If this persists after restarting the dev server, ensure pdfkit is listed in next.config serverExternalPackages.",
        500,
        process.env.NODE_ENV === "development" ? { reason } : undefined
      );
    }

    await recordReportExport({ ...auditBase, format: "pdf" });

    return withReportsTelemetry(
      new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="reports-summary.pdf"',
        },
      }),
      {
        endpoint: "/api/reports/export",
        role: String(role),
        startedAt,
        cacheHit,
        queryTimeMs: Date.now() - dbStartedAt,
      }
    );
  }

  if (wantsXlsx) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Applications");
    const headerRow = worksheet.addRow(header);
    headerRow.font = { bold: true };

    for (const r of rows) {
      worksheet.addRow([
        r.id,
        r.candidateId,
        r.candidate.candidateName,
        r.candidate.email,
        r.candidate.candidateSource ?? "OTHER",
        r.jobId,
        r.job.title,
        r.job.department,
        r.stage,
        r.source ?? "",
        r.rating ?? "",
        r.rejectionReason ?? "",
        r.createdAt ? r.createdAt : "",
        r.appliedDate ? r.appliedDate : "",
        r.interviewDate ? r.interviewDate : "",
        r.offerSentAt ? r.offerSentAt : "",
        r.hiredAt ? r.hiredAt : "",
        r.lastActivity ? r.lastActivity : "",
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    await recordReportExport({ ...auditBase, format: "xlsx" });

    return withReportsTelemetry(new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="reports-applications.xlsx"',
      },
    }), {
      endpoint: "/api/reports/export",
      role: String(role),
      startedAt,
      cacheHit,
      queryTimeMs: Date.now() - dbStartedAt,
    });
  }

  const csvLines = [header.join(",")];
  for (const r of rows) {
    csvLines.push(
      [
        r.id,
        r.candidateId,
        r.candidate.candidateName,
        r.candidate.email,
        r.candidate.candidateSource ?? "OTHER",
        r.jobId,
        r.job.title,
        r.job.department,
        r.stage,
        r.source ?? "",
        r.rating ?? "",
        r.rejectionReason ?? "",
        r.createdAt.toISOString(),
        r.appliedDate ? r.appliedDate.toISOString() : "",
        r.interviewDate ? r.interviewDate.toISOString() : "",
        r.offerSentAt ? r.offerSentAt.toISOString() : "",
        r.hiredAt ? r.hiredAt.toISOString() : "",
        r.lastActivity ? r.lastActivity.toISOString() : "",
      ].map(csvEscape).join(",")
    );
  }

  const csv = csvLines.join("\n") + "\n";

  await recordReportExport({ ...auditBase, format: "csv" });

  return withReportsTelemetry(new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="reports-applications.csv"',
    },
  }), {
    endpoint: "/api/reports/export",
    role: String(role),
    startedAt,
    cacheHit,
    queryTimeMs: Date.now() - dbStartedAt,
  });
}

