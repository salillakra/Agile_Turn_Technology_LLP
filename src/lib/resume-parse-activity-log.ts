import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildResumeParseFailedDetails,
  buildResumeParseJobActivityDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";

/** Stored in `ActivityLog.action` for resume parse pipeline events. */
export const ACTIVITY_ACTION_RESUME_PARSE_STARTED = "RESUME_PARSE_STARTED" as const;
export const ACTIVITY_ACTION_RESUME_PARSE_COMPLETED = "RESUME_PARSE_COMPLETED" as const;
export const ACTIVITY_ACTION_RESUME_PARSE_FAILED = "RESUME_PARSE_FAILED" as const;
/** Recruiter applied reviewed parse output to `Candidate` (POST .../resume/parse/apply). */
export const ACTIVITY_ACTION_RESUME_PARSE_APPLIED_TO_CANDIDATE =
  "RESUME_PARSE_APPLIED_TO_CANDIDATE" as const;

export type ResumeParseActivityAction =
  | typeof ACTIVITY_ACTION_RESUME_PARSE_STARTED
  | typeof ACTIVITY_ACTION_RESUME_PARSE_COMPLETED
  | typeof ACTIVITY_ACTION_RESUME_PARSE_FAILED;

/**
 * Prisma client or transaction client: both expose `resumeParseJob` / `activityLog` delegates.
 * Inference: `PrismaClient` and the `$transaction` callback parameter share these delegates.
 */
type Db = Pick<PrismaClient, "resumeParseJob" | "activityLog">;

export async function logResumeParseStarted(
  db: Db,
  params: {
    candidateId: string;
    userId: string | null;
    resumeParseJobId: string;
    fileHash: string;
  }
): Promise<void> {
  const details = serializeActivityLogDetails(
    buildResumeParseJobActivityDetails(params.resumeParseJobId, params.fileHash)
  );
  if (details.ok === false) {
    throw new Error(details.message);
  }
  await db.activityLog.create({
    data: {
      candidateId: params.candidateId,
      userId: params.userId ?? undefined,
      action: ACTIVITY_ACTION_RESUME_PARSE_STARTED,
      details: details.json,
    },
  });
}

export async function logResumeParseCompleted(
  db: Db,
  params: {
    candidateId: string;
    userId: string | null;
    resumeParseJobId: string;
    fileHash: string;
  }
): Promise<void> {
  const details = serializeActivityLogDetails(
    buildResumeParseJobActivityDetails(params.resumeParseJobId, params.fileHash)
  );
  if (details.ok === false) {
    throw new Error(details.message);
  }
  await db.activityLog.create({
    data: {
      candidateId: params.candidateId,
      userId: params.userId ?? undefined,
      action: ACTIVITY_ACTION_RESUME_PARSE_COMPLETED,
      details: details.json,
    },
  });
}

export async function logResumeParseFailed(
  db: Db,
  params: {
    candidateId: string;
    userId: string | null;
    resumeParseJobId: string;
    fileHash: string;
    error: string;
  }
): Promise<void> {
  const details = serializeActivityLogDetails(
    buildResumeParseFailedDetails(params.resumeParseJobId, params.fileHash, params.error)
  );
  if (details.ok === false) {
    throw new Error(details.message);
  }
  await db.activityLog.create({
    data: {
      candidateId: params.candidateId,
      userId: params.userId ?? undefined,
      action: ACTIVITY_ACTION_RESUME_PARSE_FAILED,
      details: details.json,
    },
  });
}

/**
 * Marks a parse job successful and appends `RESUME_PARSE_COMPLETED` to ActivityLog.
 * Call from the async worker / completion path when `resultJson` is ready.
 */
export async function completeResumeParseJobAndLog(
  db: Db,
  params: {
    jobId: string;
    candidateId: string;
    userId: string | null;
    resultJson: Prisma.InputJsonValue;
    status?: "COMPLETED" | "PARTIAL";
    strategyUsed?: "RULE_BASED" | "LLM" | "HYBRID";
    ruleConfidence?: number | null;
    llmConfidence?: number | null;
    disagreementFlags?: string[];
  }
): Promise<void> {
  const existing = await db.resumeParseJob.findUnique({
    where: { id: params.jobId },
    select: { id: true, candidateId: true, fileHash: true },
  });
  if (!existing || existing.candidateId !== params.candidateId) {
    throw new Error("ResumeParseJob not found or candidate mismatch");
  }
  const terminalStatus = params.status ?? "COMPLETED";
  const updated = await db.resumeParseJob.update({
    where: { id: params.jobId },
    data: {
      status: terminalStatus,
      resultJson: params.resultJson,
      error: null,
      completedAt: new Date(),
      failedAt: null,
      ...(params.strategyUsed !== undefined ? { strategyUsed: params.strategyUsed } : {}),
      ...(params.ruleConfidence !== undefined ? { ruleConfidence: params.ruleConfidence } : {}),
      ...(params.llmConfidence !== undefined ? { llmConfidence: params.llmConfidence } : {}),
      ...(params.disagreementFlags !== undefined
        ? { disagreementFlags: params.disagreementFlags }
        : {}),
    },
    select: { id: true, fileHash: true },
  });
  await logResumeParseCompleted(db, {
    candidateId: params.candidateId,
    userId: params.userId,
    resumeParseJobId: updated.id,
    fileHash: updated.fileHash,
  });
}

/**
 * Marks a parse job failed and appends `RESUME_PARSE_FAILED` to ActivityLog.
 * Call from the async worker / error handler when parsing cannot complete.
 */
export async function failResumeParseJobAndLog(
  db: Db,
  params: {
    jobId: string;
    candidateId: string;
    userId: string | null;
    error: string;
  }
): Promise<void> {
  const existing = await db.resumeParseJob.findUnique({
    where: { id: params.jobId },
    select: { id: true, candidateId: true, fileHash: true },
  });
  if (!existing || existing.candidateId !== params.candidateId) {
    throw new Error("ResumeParseJob not found or candidate mismatch");
  }
  const updated = await db.resumeParseJob.update({
    where: { id: params.jobId },
    data: {
      status: "FAILED",
      error: params.error,
      resultJson: null,
      failedAt: new Date(),
      completedAt: null,
    },
    select: { id: true, fileHash: true },
  });
  await logResumeParseFailed(db, {
    candidateId: params.candidateId,
    userId: params.userId,
    resumeParseJobId: updated.id,
    fileHash: updated.fileHash,
    error: params.error,
  });
}
