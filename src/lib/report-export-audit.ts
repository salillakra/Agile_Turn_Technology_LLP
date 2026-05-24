import { prisma } from "@/src/lib/prisma";

/**
 * Persists a row when a report file export completes successfully.
 * Failures are swallowed so download responses are not blocked.
 */
export async function recordReportExport(params: {
  userId: string | undefined;
  role: string;
  format: string;
  exportType: string;
  reportRange: string;
  jobId: string;
  department: string | null;
  rowCount: number;
}): Promise<void> {
  const uid = typeof params.userId === "string" ? params.userId.trim() : "";
  if (!uid) return;
  try {
    await prisma.reportExportLog.create({
      data: {
        userId: uid,
        role: params.role.slice(0, 32),
        format: params.format.slice(0, 16),
        exportType: params.exportType.slice(0, 64),
        reportRange: params.reportRange.slice(0, 32),
        jobId: params.jobId || null,
        department:
          params.department != null && params.department !== ""
            ? params.department.slice(0, 200)
            : null,
        rowCount: params.rowCount,
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[reports] recordReportExport failed", e);
    }
  }
}
