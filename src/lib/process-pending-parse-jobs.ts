import type { Prisma, PrismaClient } from "@prisma/client";
import { computeResumeSha256HexFromResumeUrl, readResumeBytesFromResumeUrl } from "@/src/lib/resume-file-hash";
import {
  extractPlainTextFromResumeBuffer,
  getResumeExtFromStorageFileName,
  getResumeStorageFileNameFromResumeUrl,
} from "@/src/lib/resume-extract-text";
import { buildResumeParseResultFromPlainText } from "@/src/lib/resume-parse-heuristic";
import { completeResumeParseJobAndLog, failResumeParseJobAndLog } from "@/src/lib/resume-parse-activity-log";

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

    const resumeUrl = candidate?.resumeUrl?.trim();
    if (!resumeUrl) {
      try {
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error: "Candidate has no resumeUrl; cannot parse.",
        });
        failed++;
        details.push(`job ${job.id}: FAILED (no resumeUrl)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
    if (hashed.ok === false) {
      try {
        const reason = hashed.reason;
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error:
            reason === "FILE_NOT_FOUND"
              ? "Résumé file missing from storage."
              : "Résumé URL is not a supported local storage reference.",
        });
        failed++;
        details.push(`job ${job.id}: FAILED (${reason})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    if (hashed.hash !== job.fileHash) {
      try {
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error: "File hash no longer matches job (résumé was replaced after parse was queued).",
        });
        failed++;
        details.push(`job ${job.id}: FAILED (hash mismatch)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    const bytes = await readResumeBytesFromResumeUrl(resumeUrl);
    if (bytes.ok === false) {
      try {
        const reason = bytes.reason;
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error:
            reason === "FILE_NOT_FOUND"
              ? "Could not read résumé file bytes."
              : "Invalid résumé reference.",
        });
        failed++;
        details.push(`job ${job.id}: FAILED (read ${reason})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    const storageName = getResumeStorageFileNameFromResumeUrl(resumeUrl);
    const ext = storageName ? getResumeExtFromStorageFileName(storageName) : null;
    if (!ext) {
      try {
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error: "Could not determine résumé file type from stored name.",
        });
        failed++;
        details.push(`job ${job.id}: FAILED (unknown extension)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    const extracted = await extractPlainTextFromResumeBuffer(bytes.buffer, ext);
    if (extracted.ok === false) {
      try {
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error: `Text extraction failed: ${extracted.error}`,
        });
        failed++;
        details.push(`job ${job.id}: FAILED (extract: ${extracted.error})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    if (extracted.text.length === 0) {
      try {
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error: "No text could be extracted from this file.",
        });
        failed++;
        details.push(`job ${job.id}: FAILED (empty text)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        details.push(`job ${job.id}: error on fail — ${msg}`);
      }
      continue;
    }

    const parsed = buildResumeParseResultFromPlainText(extracted.text, candidate?.candidateName ?? "");

    try {
      await completeResumeParseJobAndLog(prisma, {
        jobId: job.id,
        candidateId: job.candidateId,
        userId: null,
        resultJson: parsed as Prisma.InputJsonValue,
      });
      succeeded++;
      details.push(`job ${job.id}: DONE`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        await failResumeParseJobAndLog(prisma, {
          jobId: job.id,
          candidateId: job.candidateId,
          userId: null,
          error: msg,
        });
        failed++;
        details.push(`job ${job.id}: FAILED (${msg})`);
      } catch (e2) {
        failed++;
        details.push(`job ${job.id}: complete threw ${msg}; fail threw ${e2 instanceof Error ? e2.message : String(e2)}`);
      }
    }
  }

  return { attempted, succeeded, failed, details };
}
