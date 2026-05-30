import { Prisma, type Candidate } from "@prisma/client";
import { embedTextWithDedupeAndCache } from "@/src/lib/ai/embedding-text-cache";
import { getConfiguredEmbeddingModel } from "@/src/lib/ai-service-client";
import {
  buildCandidateSemanticText,
  type CandidateSemanticTextInput,
} from "@/src/lib/candidate-semantic-text";
import { embeddingNeedsRefresh } from "@/src/lib/embedding-refresh";
import { parseEducationJson } from "@/src/lib/candidate-structured-profile";
import { isResumeParseResult } from "@/src/lib/resume-parse-result";
import { enqueueEntityEmbeddingBestEffort } from "@/src/lib/enqueue-entity-embedding";
import { isPgvectorAvailable, toPgvectorLiteral } from "@/src/lib/pgvector-utils";
import { prisma } from "@/src/lib/prisma";
import { invalidateCandidateScoringCaches } from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";

export type StoredCandidateEmbedding = {
  model: string;
  vector: number[];
  semanticText: string;
};

export type SyncCandidateEmbeddingOptions = {
  /** Résumé parse `experience.summary` when available (preferred right after parse apply). */
  resumeSummary?: string | null;
  /** Bypass semantic-text deduplication (e.g. after résumé file replacement). */
  force?: boolean;
};

function toStoredEmbedding(
  semanticText: string,
  vector: number[]
): StoredCandidateEmbedding {
  return {
    model: getConfiguredEmbeddingModel(),
    vector,
    semanticText,
  };
}

async function loadRecentRecruiterNotes(candidateId: string): Promise<string[]> {
  const [candidateNotes, notes] = await Promise.all([
    prisma.candidateNote.findMany({
      where: { candidateId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { note: true },
    }),
    prisma.note.findMany({
      where: { candidateId, content: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { content: true },
    }),
  ]);

  return [
    ...candidateNotes.map((n) => n.note),
    ...notes
      .map((n) => (typeof n.content === "string" ? n.content : ""))
      .filter(Boolean),
  ];
}

async function loadLatestParseSummary(candidateId: string): Promise<string | null> {
  const job = await prisma.resumeParseJob.findFirst({
    where: { candidateId, status: "COMPLETED" },
    orderBy: { updatedAt: "desc" },
    select: { resultJson: true },
  });
  if (!job?.resultJson || !isResumeParseResult(job.resultJson)) {
    return null;
  }
  const structured = job.resultJson.structured;
  if (structured?.summary?.trim()) {
    return structured.summary.trim();
  }
  const summary = job.resultJson.experience.summary.trim();
  return summary || null;
}

async function loadCandidateSkillRows(candidateId: string): Promise<{ skillName: string }[]> {
  return prisma.candidateSkill.findMany({
    where: { candidateId },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { skillName: true },
  });
}

function resolveStoredSummary(
  candidate: Candidate,
  parseFallback: string | null
): string | null {
  const stored =
    typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  if (stored) return stored;
  return parseFallback;
}

function toSemanticInput(
  candidate: Candidate,
  resumeSummary: string | null | undefined,
  noteTexts: string[],
  candidateSkills: readonly { skillName: string }[]
): CandidateSemanticTextInput {
  return {
    skills: candidate.skills,
    candidateSkills,
    currentDesignation: candidate.currentDesignation,
    positionRole: candidate.positionRole,
    totalExperience: candidate.totalExperience,
    relevantExperience: candidate.relevantExperience,
    resumeSummary: resolveStoredSummary(candidate, resumeSummary ?? null),
    companies: candidate.companies,
    certifications: candidate.certifications,
    education: parseEducationJson(candidate.education) ?? undefined,
    notes: noteTexts,
  };
}

/**
 * Build semantic candidate profile, call AI /embed, persist `Candidate.embedding` + `embeddingUpdatedAt`.
 */
export async function syncCandidateEmbedding(
  candidateId: string,
  options: SyncCandidateEmbeddingOptions = {}
): Promise<void> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) return;

  await syncCandidateEmbeddingFromRow(candidate, options);
}

/**
 * Regenerate embedding from stored candidate NLP profile (post-parse).
 */
export async function syncCandidateEmbeddingAfterParse(candidateId: string): Promise<void> {
  await syncCandidateEmbedding(candidateId, { force: true });
}

export async function syncCandidateEmbeddingFromRow(
  candidate: Candidate,
  options: SyncCandidateEmbeddingOptions = {}
): Promise<void> {
  const [noteTexts, resumeSummary, candidateSkills] = await Promise.all([
    loadRecentRecruiterNotes(candidate.id),
    options.resumeSummary !== undefined
      ? Promise.resolve(options.resumeSummary)
      : loadLatestParseSummary(candidate.id),
    loadCandidateSkillRows(candidate.id),
  ]);

  const semanticText = buildCandidateSemanticText(
    toSemanticInput(candidate, resumeSummary, noteTexts, candidateSkills)
  );

  if (!semanticText) {
    console.warn(
      "[candidate-embedding-sync] skipped candidate %s: empty semantic profile",
      candidate.id
    );
    return;
  }

  const needsRefresh = embeddingNeedsRefresh({
    stored: candidate.embedding,
    semanticText,
    force: options.force,
  });

  if (!needsRefresh) {
    console.info("[candidate-embedding-sync] up to date for candidate %s", candidate.id);
    return;
  }

  const embedded = await embedTextWithDedupeAndCache(semanticText);
  if (embedded.ok === false) {
    console.error(
      "[candidate-embedding-sync] embed failed for candidate %s: %s",
      candidate.id,
      embedded.error
    );
    return;
  }

  const payload = toStoredEmbedding(semanticText, embedded.embedding);

  await prisma.candidate.update({
    where: { id: candidate.id },
    data: {
      embedding: payload as unknown as Prisma.InputJsonValue,
      embeddingUpdatedAt: new Date(),
    },
  });

  // Also store pgvector column for similarity search — skip when pgvector is not installed.
  if (await isPgvectorAvailable()) {
    await prisma.$executeRaw`
      UPDATE "candidates"
      SET "embedding_vector" = ${toPgvectorLiteral(embedded.embedding)}::vector
      WHERE "id" = ${candidate.id}
    `;
  }

  void invalidateCandidateRecommendedCandidatesCaches(candidate.id);
  void invalidateCandidateScoringCaches(candidate.id);
}

/**
 * Enqueue background embedding generation (BullMQ worker runs `syncCandidateEmbedding`).
 * @deprecated Prefer `enqueueCandidateEmbedding` from `@/src/lib/enqueue-entity-embedding`.
 */
export function scheduleCandidateEmbeddingSync(
  candidateId: string,
  _options: SyncCandidateEmbeddingOptions = {}
): void {
  enqueueEntityEmbeddingBestEffort("candidate", candidateId, "candidate-embedding-sync");
}

/** Clear cached embedding when résumé file changes (regenerated after parse apply). */
export async function invalidateCandidateEmbedding(candidateId: string): Promise<void> {
  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      embedding: Prisma.JsonNull,
      embeddingUpdatedAt: null,
    },
  });
  void invalidateCandidateRecommendedCandidatesCaches(candidateId);
  void invalidateCandidateScoringCaches(candidateId);
}
