import type { PrismaClient } from "@prisma/client";
import { syncCandidateFromResumeParse } from "@/src/lib/candidate-parse-sync";
import { computeResumeSha256HexFromResumeUrl, readResumeBytesFromResumeUrl } from "@/src/lib/resume-file-hash";
import {
  extractPlainTextFromResumeBuffer,
  getResumeExtFromStorageFileName,
  getResumeStorageFileNameFromResumeUrl,
} from "@/src/lib/resume-extract-text";
import { completeResumeParseJobAndLog, failResumeParseJobAndLog } from "@/src/lib/resume-parse-activity-log";
import { buildParseJobResultJson, runResumeParsePipeline } from "@/src/lib/resume-parse-pipeline";
import { persistParsedResumeAudits } from "@/src/lib/resume-parse/persist-parsed-resumes";
import { enqueueResumeLlmRetryJob } from "@/src/lib/enqueue-resume-parse";
import { resolveLocalResumePdfPath } from "@/src/lib/resume-local-path";
import { RESUME_APPLY_LIMITS } from "@/src/lib/resume-parse-limits";
import { enqueueCandidateEmbeddingAfterParse } from "@/src/lib/resume-parse-embedding";
import { logger } from "@/src/lib/logger";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";
import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import type { StructuredResumeParse } from "@/src/lib/structured-resume-parse";
import {
  isPlausiblePersonName,
  resolveParsedCandidateName,
} from "@/src/lib/resume-parse/candidate-name-sanitize";

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
  llmRetryCount?: number;
};

export type ExecuteResumeParseOptions = {
  resumeUrl: string;
  candidateName: string;
  llmRetryOnly?: boolean;
};

export type ExecuteResumeParseResult =
  | { outcome: "done" }
  | { outcome: "failed"; error: string };

/**
 * Runs hybrid parse (OpenResume + Gemini) for one `ResumeParseJob` row,
 * auto-applies skills to `Candidate`, and enqueues embedding refresh.
 */
const parseLog = logger.child({ component: "resume-parse" });

async function autoApplyParseToCandidate(
  prisma: PrismaClient,
  params: {
    candidateId: string;
    result: ResumeParseResult;
    structured: StructuredResumeParse | null;
    existingCandidateName?: string | null;
  }
): Promise<void> {
  const { MAX_SKILLS, MAX_SKILL_LEN, MAX_NAME_LEN, MAX_SUMMARY_LEN } = RESUME_APPLY_LIMITS;
  const result = params.result;

  const rawSkills = result.skills
    .slice(0, MAX_SKILLS)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => s.slice(0, MAX_SKILL_LEN));

  const years = Math.round(
    Math.min(60, Math.max(0, Number.isFinite(result.experience.years) ? result.experience.years : 0))
  );
  const experienceSummary = truncateSummaryWithFullStop(
    result.experience.summary,
    MAX_SUMMARY_LEN
  );

  const skillRows = rawSkills.map((skillName) => ({
    candidateId: params.candidateId,
    skillName,
  }));

  const candidateName = resolveParsedCandidateName({
    llmName: result.name,
    fallbackName: params.existingCandidateName,
    existingName: params.existingCandidateName,
  }).slice(0, MAX_NAME_LEN);

  const resultForSync: ResumeParseResult = {
    ...result,
    name: candidateName,
    skills: rawSkills,
    experience: { years, summary: experienceSummary },
  };

  await prisma.$transaction(async (tx) => {
    await tx.candidateSkill.deleteMany({ where: { candidateId: params.candidateId } });
    if (skillRows.length > 0) {
      await tx.candidateSkill.createMany({ data: skillRows });
    }
    if (candidateName && isPlausiblePersonName(candidateName)) {
      await tx.candidate.update({
        where: { id: params.candidateId },
        data: { candidateName },
      });
    }
    await syncCandidateFromResumeParse(tx, {
      candidateId: params.candidateId,
      result: resultForSync,
      structured: params.structured,
    });
  });
}

export async function executeResumeParseJob(
  prisma: PrismaClient,
  job: ResumeParseJobRecord,
  context: ExecuteResumeParseOptions
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
        ? "resume file missing from storage."
        : "resume URL is not a supported local storage reference.";
    await failResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      error,
    });
    return { outcome: "failed", error };
  }

  if (hashed.hash !== job.fileHash) {
    const error = "File hash no longer matches job (resume was replaced after parse was queued).";
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
        ? "Could not read resume file bytes."
        : "Invalid resume reference.";
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
    const error = "Could not determine resume file type from stored name.";
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
    llmRetryOnly: context.llmRetryOnly,
    pdfPath: resolveLocalResumePdfPath(resumeUrl),
    pdfBuffer: ext === ".pdf" ? bytes.buffer : null,
  });

  const terminalStatus = pipeline.partialLlmMiss ? "PARTIAL" : "COMPLETED";

  try {
    await completeResumeParseJobAndLog(prisma, {
      jobId: job.id,
      candidateId: job.candidateId,
      userId: null,
      resultJson: await buildParseJobResultJson(pipeline),
      status: terminalStatus,
      strategyUsed: pipeline.strategyUsed,
      ruleConfidence: pipeline.ruleConfidence,
      llmConfidence: pipeline.llmConfidence,
      disagreementFlags: pipeline.disagreementFlags,
    });

    await persistParsedResumeAudits(prisma, {
      candidateId: job.candidateId,
      resumeParseJobId: job.id,
      rulePayload: pipeline.hybridMeta.sources.rule,
      ruleConfidence: pipeline.ruleConfidence,
      llmPayload: pipeline.hybridMeta.sources.llm,
      llmConfidence: pipeline.llmConfidence,
      mergedPayload: pipeline.resultJson,
      strategyUsed: pipeline.strategyUsed,
    });

    await autoApplyParseToCandidate(prisma, {
      candidateId: job.candidateId,
      result: pipeline.resultJson,
      structured: pipeline.structured,
      existingCandidateName: context.candidateName,
    });

    void enqueueCandidateEmbeddingAfterParse(job.candidateId).catch((e) => {
      parseLog.error({ err: e, candidateId: job.candidateId }, "embedding enqueue failed");
    });

    if (pipeline.partialLlmMiss) {
      const maxRetries = parseInt(process.env.AI_RESUME_LLM_MAX_RETRIES ?? "3", 10);
      const retryCount = job.llmRetryCount ?? 0;
      if (retryCount < maxRetries) {
        await prisma.resumeParseJob.update({
          where: { id: job.id },
          data: { llmRetryCount: { increment: 1 } },
        });
        void enqueueResumeLlmRetryJob({
          candidateId: job.candidateId,
          resumeUrl,
          parseJobId: job.id,
          retryCount: retryCount + 1,
        }).catch((e) => {
          parseLog.error({ err: e, jobId: job.id }, "LLM retry enqueue failed");
        });
      }
    }

    parseLog.info(
      {
        jobId: job.id,
        candidateId: job.candidateId,
        status: terminalStatus,
        source: pipeline.parseSource,
        strategy: pipeline.strategyUsed,
        semanticChars: pipeline.semanticProfileText.length,
        skillCount: pipeline.resultJson.skills.length,
      },
      "resume parse completed and applied to candidate"
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
 * Picks pending `ResumeParseJob` rows (oldest first), reads the candidate's resume file,
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
