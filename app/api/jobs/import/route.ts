import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { createJobFromBody } from "@/src/lib/job-create-from-body";
import {
  JOB_CSV_TEMPLATE,
  jobCsvRowToBody,
  parseJobCsv,
} from "@/src/lib/job-csv-import";
import { canCreateJob } from "@/src/lib/rbac";

export type JobImportRowResult = {
  row: number;
  title: string;
  success: boolean;
  jobId?: string;
  error?: string;
};

/** GET /api/jobs/import — download CSV template. */
export async function GET() {
  const auth = await requireApiAuth(canCreateJob);
  if (auth instanceof NextResponse) return auth;

  return new NextResponse(JOB_CSV_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="jobs-import-template.csv"',
    },
  });
}

/** POST /api/jobs/import — bulk create jobs from CSV (multipart field `file`). */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canCreateJob);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const userId = session.user?.id;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const creatorId = userId.trim();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing CSV file (field: file)" }, { status: 400 });
  }

  const content = await file.text();
  const parsed = parseJobCsv(content);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const results: JobImportRowResult[] = [];
  let created = 0;
  let failed = 0;

  for (const row of parsed.rows) {
    const title = row.values.title?.trim() || "";
    const body = jobCsvRowToBody(row.values);
    const result = await createJobFromBody(creatorId, body);

    if (result.ok) {
      created++;
      results.push({
        row: row.rowNumber,
        title: result.job.title,
        success: true,
        jobId: result.job.id,
      });
    } else {
      failed++;
      results.push({
        row: row.rowNumber,
        title: title || `(row ${row.rowNumber})`,
        success: false,
        error: result.error,
      });
    }
  }

  return NextResponse.json({
    created,
    failed,
    total: parsed.rows.length,
    results,
  });
}
