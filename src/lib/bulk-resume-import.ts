import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session } from "next-auth";
import { batchCreateApplicationsForJob } from "@/src/lib/batch-applications";
import { normalizeCandidateEmail } from "@/src/lib/candidate-identity";
import { enqueueResumeParseForCandidate } from "@/src/lib/enqueue-resume-parse";
import { prisma } from "@/src/lib/prisma";
import { extractPlainTextFromResumeBuffer } from "@/src/lib/resume-extract-text";
import { ruleBasedParse } from "@/src/lib/resume-parse/rule-based-parse";
import {
  ensureResumeUploadDir,
  getResumeUploadDir,
  RESUME_READ_URL_PREFIX,
} from "@/src/lib/resume-storage";
import {
  buildStoredFileName,
  getMaxResumeBytes,
  RESUME_FILE_TOO_LARGE_MESSAGE,
  validateResumeFile,
  type AllowedResumeExt,
} from "@/src/lib/resume-upload-validation";

/** Max resumes per bulk request (HR / recruiter). */
export const BULK_RESUME_MAX_FILES = 100;

const BATCH_CHUNK = 25;

export type BulkResumeFileResult = {
  fileName: string;
  success: boolean;
  candidateId?: string;
  applicationId?: string;
  parseEnqueued?: boolean;
  reusedCandidate?: boolean;
  error?: string;
};

export type BulkResumeImportResult = {
  total: number;
  succeeded: number;
  failed: number;
  applicationsCreated: number;
  parseEnqueued: number;
  results: BulkResumeFileResult[];
};

function nameFromFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "").trim();
  const cleaned = base
    .replace(/[_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned : "Unknown Candidate";
}

function placeholderEmail(buffer: Buffer, ownerId: string): string {
  const digest = createHash("sha256")
    .update(ownerId)
    .update(buffer)
    .digest("hex")
    .slice(0, 16);
  return `bulk+${digest}@import.local`;
}

async function resolveIdentityFromBuffer(params: {
  buffer: Buffer;
  ext: AllowedResumeExt;
  originalName: string;
  ownerId: string;
}): Promise<{ candidateName: string; email: string; contactNumber: string | null }> {
  const fallbackName = nameFromFileName(params.originalName);
  const extracted = await extractPlainTextFromResumeBuffer(params.buffer, params.ext);
  if (extracted.ok && extracted.text.length > 40) {
    const parsed = await ruleBasedParse({
      plainText: extracted.text,
      fallbackName,
      pdfBuffer: params.ext === ".pdf" ? params.buffer : null,
    });
    const email =
      normalizeCandidateEmail(parsed.email) ||
      placeholderEmail(params.buffer, params.ownerId);
    const candidateName =
      (parsed.name && parsed.name.trim().length >= 2
        ? parsed.name.trim()
        : fallbackName) || "Unknown Candidate";
    const contactNumber = parsed.phone?.trim() || null;
    return { candidateName, email, contactNumber };
  }
  return {
    candidateName: fallbackName,
    email: placeholderEmail(params.buffer, params.ownerId),
    contactNumber: null,
  };
}

async function upsertOwnedCandidate(params: {
  /** Job silo owner — must match job.ownerId so applications pass OWNER_MISMATCH checks. */
  ownerId: string;
  createdById: string;
  candidateName: string;
  email: string;
  contactNumber: string | null;
}): Promise<{ id: string; reused: boolean }> {
  const email = normalizeCandidateEmail(params.email);
  const existing = await prisma.candidate.findFirst({
    where: { email, ownerId: params.ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    await prisma.candidate.update({
      where: { id: existing.id },
      data: {
        candidateName: params.candidateName,
        ...(params.contactNumber
          ? { contactNumber: params.contactNumber }
          : {}),
      },
    });
    return { id: existing.id, reused: true };
  }
  const created = await prisma.candidate.create({
    data: {
      candidateName: params.candidateName,
      email,
      contactNumber: params.contactNumber,
      ownerId: params.ownerId,
      createdById: params.createdById,
      candidateSource: "OTHER",
    },
    select: { id: true },
  });
  return { id: created.id, reused: false };
}

async function storeResumeOnCandidate(params: {
  candidateId: string;
  buffer: Buffer;
  originalName: string;
  ext: AllowedResumeExt;
  actorUserId: string;
}): Promise<{ resumeUrl: string; parseEnqueued: boolean; error?: string }> {
  ensureResumeUploadDir();
  const storedName = buildStoredFileName(params.ext);
  const absolutePath = path.join(getResumeUploadDir(), storedName);
  await writeFile(absolutePath, params.buffer);
  const resumeUrl = `${RESUME_READ_URL_PREFIX}${encodeURIComponent(storedName)}`;

  await prisma.candidate.update({
    where: { id: params.candidateId },
    data: {
      resumeUrl,
      resumeFileName: params.originalName,
    },
  });

  const enqueued = await enqueueResumeParseForCandidate({
    candidateId: params.candidateId,
    resumeUrl,
    userId: params.actorUserId,
    forceNewJob: true,
  });

  if (enqueued.ok === false) {
    return {
      resumeUrl,
      parseEnqueued: false,
      error: enqueued.message,
    };
  }
  const parseEnqueued =
    enqueued.processing === "queued" || enqueued.processing === "inline-fallback";
  return { resumeUrl, parseEnqueued };
}

/**
 * Bulk import resumes for one job: create/reuse candidates → store files → enqueue parse workers
 * → create APPLIED applications (chunked). Skip eligibility so parse-in-flight does not block pipeline.
 */
export async function importResumesForJob(params: {
  session: Session;
  jobId: string;
  /** Job.ownerId — candidates are created in this silo. */
  jobOwnerId: string;
  /** Acting user (createdBy / parse enqueue actor). */
  actorUserId: string;
  files: File[];
}): Promise<BulkResumeImportResult> {
  const results: BulkResumeFileResult[] = [];
  const candidateIdsForApps: string[] = [];
  let succeeded = 0;
  let failed = 0;
  let parseEnqueued = 0;

  let totalBytes = 0;
  for (const file of params.files) {
    totalBytes += file.size;
  }
  const maxTotal = BULK_RESUME_MAX_FILES * getMaxResumeBytes();
  if (totalBytes > maxTotal) {
    throw new Error(
      `TOTAL_SIZE_EXCEEDED: Total upload exceeds ${Math.round(maxTotal / (1024 * 1024))} MB`
    );
  }

  for (const file of params.files) {
    const fileName = typeof file.name === "string" ? file.name : "resume";
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const maxBytes = getMaxResumeBytes();
      if (buffer.length > maxBytes) {
        throw new Error(RESUME_FILE_TOO_LARGE_MESSAGE);
      }
      const validated = validateResumeFile({
        originalName: fileName,
        mimeType: typeof file.type === "string" ? file.type : "",
        buffer,
      });
      if (validated.ok === false) {
        throw new Error(validated.message);
      }

      const identity = await resolveIdentityFromBuffer({
        buffer,
        ext: validated.ext,
        originalName: fileName,
        ownerId: params.jobOwnerId,
      });

      const candidate = await upsertOwnedCandidate({
        ownerId: params.jobOwnerId,
        createdById: params.actorUserId,
        candidateName: identity.candidateName,
        email: identity.email,
        contactNumber: identity.contactNumber,
      });

      const stored = await storeResumeOnCandidate({
        candidateId: candidate.id,
        buffer,
        originalName: fileName,
        ext: validated.ext,
        actorUserId: params.actorUserId,
      });

      if (stored.parseEnqueued) parseEnqueued += 1;

      candidateIdsForApps.push(candidate.id);
      succeeded += 1;
      results.push({
        fileName,
        success: true,
        candidateId: candidate.id,
        parseEnqueued: stored.parseEnqueued,
        reusedCandidate: candidate.reused,
        error: stored.error,
      });
    } catch (e) {
      failed += 1;
      results.push({
        fileName,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let applicationsCreated = 0;
  const uniqueCandidateIds = [...new Set(candidateIdsForApps)];
  for (let i = 0; i < uniqueCandidateIds.length; i += BATCH_CHUNK) {
    const chunk = uniqueCandidateIds.slice(i, i + BATCH_CHUNK);
    if (chunk.length === 0) continue;
    const batch = await batchCreateApplicationsForJob({
      session: params.session,
      jobId: params.jobId,
      candidateIds: chunk,
      skipEligibilityCheck: true,
    });
    applicationsCreated += batch.created;
    const appByCandidate = new Map(
      batch.createdEntries.map((e) => [e.candidateId, e.applicationId])
    );
    for (const r of results) {
      if (!r.success || !r.candidateId || r.applicationId) continue;
      const appId = appByCandidate.get(r.candidateId);
      if (appId) r.applicationId = appId;
    }
  }

  return {
    total: params.files.length,
    succeeded,
    failed,
    applicationsCreated,
    parseEnqueued,
    results,
  };
}
