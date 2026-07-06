import { prisma } from "@/src/lib/prisma";

export function normalizeCandidateEmail(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function normalizeCandidateName(name: string | null | undefined): string {
  return typeof name === "string"
    ? name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

/** Stable key for one person across duplicate candidate rows. */
export function candidateIdentityKey(params: {
  candidateId: string;
  candidateName: string;
  email?: string | null;
}): string {
  const name = normalizeCandidateName(params.candidateName);
  if (name.length >= 2) return `name:${name}`;
  const email = normalizeCandidateEmail(params.email);
  if (email) return `email:${email}`;
  return `id:${params.candidateId}`;
}

/** @deprecated Alias for {@link candidateIdentityKey}. */
export const recommendationIdentityKey = candidateIdentityKey;

export type PipelineIdentityKeys = {
  emails: Set<string>;
  names: Set<string>;
  candidateIds: Set<string>;
};

export async function loadActivePipelineIdentityKeysForJob(
  jobId: string
): Promise<PipelineIdentityKeys> {
  const apps = await prisma.application.findMany({
    where: { jobId, withdrawnAt: null },
    select: {
      candidateId: true,
      candidate: { select: { email: true, candidateName: true } },
    },
  });

  const emails = new Set<string>();
  const names = new Set<string>();
  const candidateIds = new Set<string>();

  for (const row of apps) {
    candidateIds.add(row.candidateId);
    const email = normalizeCandidateEmail(row.candidate.email);
    if (email) emails.add(email);
    const name = normalizeCandidateName(row.candidate.candidateName);
    if (name.length >= 2) names.add(name);
  }

  return { emails, names, candidateIds };
}

export function isCandidateOnJobPipeline(
  candidate: { id: string; email?: string | null; candidateName: string },
  keys: PipelineIdentityKeys,
  siblingIds?: readonly string[]
): boolean {
  if (keys.candidateIds.has(candidate.id)) return true;
  if (siblingIds?.some((id) => keys.candidateIds.has(id))) return true;
  const email = normalizeCandidateEmail(candidate.email);
  if (email && keys.emails.has(email)) return true;
  const name = normalizeCandidateName(candidate.candidateName);
  if (name.length >= 2 && keys.names.has(name)) return true;
  return false;
}

/** True when this row or any duplicate candidate id is already on the job pipeline. */
export async function isCandidateExcludedFromJobRecommendations(
  candidate: { id: string; email?: string | null; candidateName: string },
  jobId: string
): Promise<boolean> {
  const keys = await loadActivePipelineIdentityKeysForJob(jobId);
  const siblingIds = await resolveSiblingCandidateIds(candidate.id);
  return isCandidateOnJobPipeline(candidate, keys, siblingIds);
}

/** Unique people per job (active applications only). */
export async function countUniqueActiveApplicantsByJobIds(
  jobIds: readonly string[]
): Promise<Map<string, number>> {
  if (jobIds.length === 0) return new Map();

  const apps = await prisma.application.findMany({
    where: { jobId: { in: [...jobIds] }, withdrawnAt: null },
    select: {
      jobId: true,
      candidateId: true,
      candidate: { select: { email: true, candidateName: true } },
    },
  });

  const byJob = new Map<string, Set<string>>();
  for (const app of apps) {
    let keys = byJob.get(app.jobId);
    if (!keys) {
      keys = new Set();
      byJob.set(app.jobId, keys);
    }
    keys.add(
      candidateIdentityKey({
        candidateId: app.candidateId,
        candidateName: app.candidate.candidateName,
        email: app.candidate.email,
      })
    );
  }

  const counts = new Map<string, number>();
  for (const jobId of jobIds) {
    counts.set(jobId, byJob.get(jobId)?.size ?? 0);
  }
  return counts;
}

export async function countUniqueActiveApplicantsForJob(jobId: string): Promise<number> {
  const apps = await prisma.application.findMany({
    where: { jobId, withdrawnAt: null },
    select: {
      candidateId: true,
      candidate: { select: { email: true, candidateName: true } },
    },
  });

  const seen = new Set<string>();
  for (const row of apps) {
    seen.add(
      candidateIdentityKey({
        candidateId: row.candidateId,
        candidateName: row.candidate.candidateName,
        email: row.candidate.email,
      })
    );
  }
  return seen.size;
}

/** All DB candidate ids for the same person (union of email + name matches). */
export async function resolveSiblingCandidateIds(candidateId: string): Promise<string[]> {
  const row = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, email: true, candidateName: true },
  });
  if (!row) return [candidateId];

  const ids = new Set<string>([row.id]);

  const email = normalizeCandidateEmail(row.email);
  if (email) {
    const byEmail = await prisma.candidate.findMany({
      where: { email },
      select: { id: true },
    });
    for (const s of byEmail) ids.add(s.id);
  }

  const name = normalizeCandidateName(row.candidateName);
  if (name.length >= 2) {
    const byName = await prisma.candidate.findMany({
      where: {
        candidateName: {
          equals: row.candidateName,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    for (const s of byName) ids.add(s.id);
  }

  return [...ids];
}

/**
 * Which duplicate row to attach the application to (resume/skills, or existing app on job).
 */
export async function resolveCanonicalCandidateIdForShortlist(
  candidateId: string,
  jobId?: string
): Promise<string> {
  const siblingIds = await resolveSiblingCandidateIds(candidateId);
  if (siblingIds.length === 1) return candidateId;

  if (jobId) {
    const existing = await prisma.application.findFirst({
      where: {
        jobId,
        candidateId: { in: siblingIds },
        withdrawnAt: null,
      },
      select: { candidateId: true },
      orderBy: { appliedDate: "desc" },
    });
    if (existing) return existing.candidateId;
  }

  const rows = await prisma.candidate.findMany({
    where: { id: { in: siblingIds } },
    select: {
      id: true,
      resumeUrl: true,
      skills: true,
      normalizedSkills: true,
      candidateSkills: { select: { id: true }, take: 1 },
    },
  });

  let bestId = candidateId;
  let bestScore = -1;
  for (const r of rows) {
    let score = 0;
    if (r.resumeUrl?.trim()) score += 200;
    score += (r.normalizedSkills?.length ?? 0) * 2 + (r.skills?.length ?? 0);
    if (r.candidateSkills.length > 0) score += 50;
    if (r.id === candidateId) score += 5;
    if (score > bestScore) {
      bestScore = score;
      bestId = r.id;
    }
  }
  return bestId;
}

/** One application per person per job — keeps the most recent `appliedDate`. */
export function dedupeApplicationsByCandidateIdentity<
  T extends {
    jobId: string;
    candidateId: string;
    appliedDate: Date;
    candidate: { email: string; candidateName: string };
  },
>(applications: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const app of applications) {
    const personKey = candidateIdentityKey({
      candidateId: app.candidateId,
      candidateName: app.candidate.candidateName,
      email: app.candidate.email,
    });
    const key = `${app.jobId}:${personKey}`;
    const prev = best.get(key);
    if (!prev || app.appliedDate > prev.appliedDate) {
      best.set(key, app);
    }
  }
  return [...best.values()].sort(
    (a, b) => b.appliedDate.getTime() - a.appliedDate.getTime()
  );
}
