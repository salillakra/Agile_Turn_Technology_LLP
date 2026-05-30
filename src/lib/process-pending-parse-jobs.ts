import type { PrismaClient } from "@prisma/client";
import { computeResumeSha256HexFromResumeUrl, readResumeBytesFromResumeUrl } from "@/src/lib/resume-file-hash";
import {
  extractPlainTextFromResumeBuffer,
  getResumeExtFromStorageFileName,
  getResumeStorageFileNameFromResumeUrl,
} from "@/src/lib/resume-extract-text";
import { completeResumeParseJobAndLog, failResumeParseJobAndLog } from "@/src/lib/resume-parse-activity-log";
import { buildParseJobResultJson, runResumeParsePipeline } from "@/src/lib/resume-parse-pipeline";

export type ProcessParseJobsResult = {
  /** Jobs attempted (one loop iteration each). */
  attempted: number;
  /** Completed with extracted/heuristic result. */
  succeeded: number;
  /** Marked FAILED in DB. */
  failed: number;
  /** Human-readable lines for logging / API response. */
  details: string[];
};

const DEFAULT_LIMIT = 10;

export type ResumeParseJobRecord = {
  id: string;
  candidateId: string;
  fileHash: string;
};

export type ExecuteResumeParseResult =
  | { outcome: "done" }
  | { outcome: "failed"; error: string };

/**
 * Runs NLP/heuristic parse for one `ResumeParseJob` row.
 * Marks COMPLETED/FAILED and stores `resultJson` only — does **not** update `Candidate`
 * or enqueue embeddings until recruiter confirm via POST .../resume/parse/apply.
 */
export async function executeResumeParseJob(
  prisma: PrismaClient,
  job: ResumeParseJobRecord,
  context: { resumeUrl: string; candidateName: string }
): Promise<ExecuteResumeParseResult> {
  const resumeUrl = context.resumeUrl.trim();
  if (!resumeUrl) {
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error: "Candidate has no resumeUrl; cannot parse.",
    });
    return { outcome: "failed", error: "no resumeUrl" };
  }

  const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
  if (hashed.ok === false) {
    const error =
      hashed.reason === "FILE_NOT_FOUND"
        ? "Résumé file missing from storage."
        : "Résumé URL is not a supported local storage reference.";
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  if (hashed.hash !== job.fileHash) {
    const error = "File hash no longer matches job (résumé was replaced after parse was queued).";
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  const bytes = await readResumeBytesFromResumeUrl(resumeUrl);
  if (bytes.ok === false) {
    const error =
      bytes.reason === "FILE_NOT_FOUND"
        ? "Could not read résumé file bytes."
        : "Invalid résumé reference.";
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  const storageName = getResumeStorageFileNameFromResumeUrl(resumeUrl);
  const ext = storageName ? getResumeExtFromStorageFileName(storageName) : null;
  if (!ext) {
    const error = "Could not determine résumé file type from stored name.";
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  const extracted = await extractPlainTextFromResumeBuffer(bytes.buffer, ext);
  if (extracted.ok === false) {
    const error = `Text extraction failed: ${extracted.error}`;
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  if (extracted.text.length === 0) {
    const error = "No text could be extracted from this file.";
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  const pipeline = await runResumeParsePipeline({
    plainText: extracted.text,
    resumeUrl,
    candidateName: context.candidateName,
  });

  try {
    await completeResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      resultJson: await buildParseJobResultJson(pipeline),
    });

    console.info(
      "[resume-parse] job %s source=%s semanticChars=%d candidate=%s (awaiting recruiter apply)",
      job.id,
      pipeline.parseSource,
      pipeline.semanticProfileText.length,
      job.candidateId
    );

    return { outcome: "done" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error: msg,
    });
    return { outcome: "failed", error: msg };
  }
}

/**
 * Picks pending `ResumeParseJob` rows (oldest first), reads the candidate's résumé file,
 * and completes or fails each job. Uses stub parsing until a real extractor is implemented.
 *
 * `userId: null` — system/cron worker (ActivityLog shows no user).
 */
export async function processPendingParseJobs(
  prisma: PrismaClient,
  options?: { limit?: number }
): Promise<ProcessParseJobsResult> {
  const limit = Math.min(50, Math.max(1, options?.limit ?? DEFAULT_LIMIT));
  const details: string[] = [];
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    const job = await prisma.resumeParseJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        candidateId: true,
        fileHash: true,
      },
    });

    if (!job) break;

    attempted++;

    const candidate = await prisma.candidate.findUnique({
      where: { id: job.candidateId },
      select: { resumeUrl: true, candidateName: true },
    });

    const resumeUrl = candidate?.resumeUrl?.trim() ?? "";
    const result = await executeResumeParseJob(prisma, job, {
      resumeUrl,
      candidateName: candidate?.candidateName ?? "",
    });

    if (result.outcome === "done") {
      succeeded++;
      details.push(`job ${job.id}: COMPLETED`);
    } else {
      failed++;
      details.push(`job ${job.id}: FAILED (${result.error})`);
    }
  }

  return { attempted, succeeded, failed, details };
}
