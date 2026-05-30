import type { ApplicationStage } from "@prisma/client";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import {
  buildApplicationCreatedDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { apiError } from "@/src/lib/api-error-response";
import { isAdmin } from "@/src/lib/rbac";
import {
  buildCandidateVisibilityWhere,
  canAccessJobByScope,
} from "@/src/lib/rbac-scope";
import { prisma } from "@/src/lib/prisma";
import { computeResumeSha256HexFromResumeUrl } from "@/src/lib/resume-file-hash";
import { computeSkillMatchPercent } from "@/src/lib/resume-job-match";
import {
  notifyRecruitersApplicationCreated,
  scheduleNotificationWork,
} from "@/src/lib/notification-service";
import {
  candidateIdentityKey,
  resolveCanonicalCandidateIdForShortlist,
  resolveSiblingCandidateIds,
} from "@/src/lib/candidate-identity";
import { isValidCuid } from "@/src/lib/validate-id";

const MAX_BATCH_JOB_IDS = 25;
const MAX_BATCH_CANDIDATE_IDS = 25;
const DEFAULT_STAGE: ApplicationStage = "APPLIED";

export type BatchCreateApplicationsResult = {
  created: number;
  skippedDuplicates: number;
  applicationIds: string[];
};

export type BatchShortlistCandidateResult = {
  candidateId: string;
  status: "created" | "reactivated" | "duplicate" | "skipped";
  reason?: string;
  applicationId?: string;
  canonicalCandidateId?: string;
};

export type BatchCreateApplicationsForJobResult = {
  created: number;
  skippedDuplicates: number;
  skippedNotEligible: number;
  skippedInaccessible: number;
  skippedOther: number;
  applicationIds: string[];
  /** One entry per successfully created application. */
  createdEntries: Array<{ candidateId: string; applicationId: string }>;
  results: BatchShortlistCandidateResult[];
};

type CreateOneResult =
  | { status: "created"; applicationId: string }
  | { status: "reactivated"; applicationId: string }
  | { status: "duplicate" }
  | { status: "skipped"; reason: string };

type CreateOneApplicationOptions = {
  /** Recommended shortlist — already passed job match scoring in UI. */
  skipEligibilityCheck?: boolean;
};

type ShortlistOneResult = CreateOneResult & {
  canonicalCandidateId: string;
};

/**
 * Try canonical profile first, then sibling duplicate rows (fixes Neeraj-style multi-record shortlist).
 */
async function shortlistOneCandidateForJob(
  session: Session,
  requestedId: string,
  jobId: string,
  stage: ApplicationStage,
  options: CreateOneApplicationOptions
): Promise<ShortlistOneResult> {
  const siblingIds = await resolveSiblingCandidateIds(requestedId);
  const canonicalFirst = await resolveCanonicalCandidateIdForShortlist(
    requestedId,
    jobId
  );
  const tryIds = [
    canonicalFirst,
    ...siblingIds.filter((id) => id !== canonicalFirst),
  ];

  let last: CreateOneResult = { status: "skipped", reason: "NOT_FOUND" };

  for (const candidateId of tryIds) {
    const result = await createOneApplication(
      session,
      candidateId,
      jobId,
      stage,
      options
    );
    last = result;

    if (result.status === "created" || result.status === "reactivated") {
      return { ...result, canonicalCandidateId: candidateId };
    }
    if (result.status === "duplicate") {
      return { ...result, canonicalCandidateId: candidateId };
    }
    if (
      result.status === "skipped" &&
      result.reason !== "NOT_ELIGIBLE" &&
      result.reason !== "NOT_FOUND"
    ) {
      return { ...result, canonicalCandidateId: candidateId };
    }
  }

  return { ...last, canonicalCandidateId: canonicalFirst };
}

async function assertJobApplicationEligibility(
  candidate: { id: string; resumeUrl: string | null },
  job: {
    id: string;
    status: string;
    jobMeta: unknown;
  }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (job.status !== "OPEN") {
    return { ok: false, reason: "JOB_NOT_OPEN" };
  }

  const jobMetaObj =
    job.jobMeta != null && typeof job.jobMeta === "object" && !Array.isArray(job.jobMeta)
      ? (job.jobMeta as Record<string, unknown>)
      : null;
  const thresholdRaw = jobMetaObj?.resumeMatchThreshold;
  const threshold =
    thresholdRaw === null || thresholdRaw === undefined || thresholdRaw === ""
      ? null
      : Number(thresholdRaw);
  const requiredSkillsRaw = jobMetaObj?.requiredSkills;
  const requiredSkills = Array.isArray(requiredSkillsRaw)
    ? requiredSkillsRaw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  if (threshold == null || !Number.isFinite(threshold) || threshold <= 0 || requiredSkills.length === 0) {
    return { ok: true };
  }

  const resumeUrl = typeof candidate.resumeUrl === "string" ? candidate.resumeUrl.trim() : "";
  if (!resumeUrl) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  const hashed = await computeResumeSha256HexFromResumeUrl(resumeUrl);
  if (hashed.ok === false) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  const done = await prisma.resumeParseJob.findFirst({
    where: { candidateId: candidate.id, fileHash: hashed.hash, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!done) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  const skills = await prisma.candidateSkill.findMany({
    where: { candidateId: candidate.id },
    select: { skillName: true },
    take: 500,
  });
  const candidateSkills = skills.map((s) => s.skillName);
  if (candidateSkills.length === 0) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  const match = computeSkillMatchPercent({ requiredSkills, candidateSkills });
  if (match.percent < threshold) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  return { ok: true };
}

async function createOneApplication(
  session: Session,
  candidateId: string,
  jobId: string,
  stage: ApplicationStage,
  options: CreateOneApplicationOptions = {}
): Promise<CreateOneResult> {
  const siblingIds = await resolveSiblingCandidateIds(candidateId);

  const activeOnJob = await prisma.application.findFirst({
    where: {
      jobId,
      candidateId: { in: siblingIds },
      withdrawnAt: null,
    },
    select: { id: true, candidateId: true },
  });
  if (activeOnJob) {
    return { status: "duplicate" };
  }

  const withdrawnRow = await prisma.application.findFirst({
    where: {
      jobId,
      candidateId: { in: siblingIds },
      withdrawnAt: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, candidateId: true, withdrawnAt: true },
  });

  const createCandidateId = withdrawnRow?.candidateId ?? candidateId;

  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id: createCandidateId },
      select: { id: true, resumeUrl: true },
    }),
    prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, title: true, jobMeta: true },
    }),
  ]);

  if (!candidate || !job) {
    return { status: "skipped", reason: "NOT_FOUND" };
  }

  if (job.status !== "OPEN") {
    return { status: "skipped", reason: "JOB_NOT_OPEN" };
  }

  if (!isAdmin(session.user?.role)) {
    const scoped = await prisma.jobAssignment.findUnique({
      where: { jobId_userId: { jobId, userId: session.user?.id ?? "" } },
      select: { id: true },
    });
    if (!scoped) {
      return { status: "skipped", reason: "FORBIDDEN" };
    }
  }

  if (!options.skipEligibilityCheck) {
    const eligible = await assertJobApplicationEligibility(candidate, job);
    if (eligible.ok === false) {
      return { status: "skipped", reason: eligible.reason };
    }
  }

  const createdDetailsSerialized = serializeActivityLogDetails(
    buildApplicationCreatedDetails(jobId)
  );
  if (createdDetailsSerialized.ok === false) {
    return { status: "skipped", reason: createdDetailsSerialized.code };
  }

  const userId = session.user?.id;

  try {
    if (withdrawnRow?.withdrawnAt != null) {
      const application = await prisma.$transaction(async (tx) => {
        const row = await tx.application.update({
          where: { id: withdrawnRow.id },
          data: {
            withdrawnAt: null,
            withdrawnReason: null,
            stage,
          },
          include: {
            candidate: { select: { candidateName: true } },
            job: { select: { title: true } },
          },
        });

        if (typeof userId === "string") {
          await tx.activityLog.create({
            data: {
              applicationId: row.id,
              userId,
              action: "APPLICATION_CREATED",
              details: createdDetailsSerialized.json,
            },
          });
        }

        return row;
      });

      scheduleNotificationWork(
        notifyRecruitersApplicationCreated({
          applicationId: application.id,
          candidateName: application.candidate.candidateName,
          jobTitle: application.job.title,
          jobId: application.jobId,
          actorUserId: typeof userId === "string" ? userId : undefined,
        })
      );

      return { status: "reactivated", applicationId: application.id };
    }

    const application = await prisma.$transaction(async (tx) => {
      const row = await tx.application.create({
        data: {
          candidateId: createCandidateId,
          jobId,
          stage,
        },
        include: {
          candidate: { select: { candidateName: true } },
          job: { select: { title: true } },
        },
      });

      if (typeof userId === "string") {
        await tx.activityLog.create({
          data: {
            applicationId: row.id,
            userId,
            action: "APPLICATION_CREATED",
            details: createdDetailsSerialized.json,
          },
        });
      }

      return row;
    });

    scheduleNotificationWork(
      notifyRecruitersApplicationCreated({
        applicationId: application.id,
        candidateName: application.candidate.candidateName,
        jobTitle: application.job.title,
        jobId: application.jobId,
        actorUserId: typeof userId === "string" ? userId : undefined,
      })
    );

    return { status: "created", applicationId: application.id };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return { status: "duplicate" };
    }
    throw e;
  }
}

/**
 * Create applications for a candidate across multiple jobs (multi-role apply).
 * Skips duplicates (existing candidate+job pair or duplicate ids in request).
 */
export async function batchCreateApplications(params: {
  session: Session;
  candidateId: string;
  jobIds: readonly string[];
  stage?: ApplicationStage;
}): Promise<BatchCreateApplicationsResult> {
  const stage = params.stage ?? DEFAULT_STAGE;
  const applicationIds: string[] = [];
  let created = 0;
  let skippedDuplicates = 0;

  const seen = new Set<string>();
  const orderedUnique: string[] = [];
  for (const raw of params.jobIds ?? []) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || !isValidCuid(id)) continue;
    if (seen.has(id)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(id);
    orderedUnique.push(id);
  }

  if (orderedUnique.length > MAX_BATCH_JOB_IDS) {
    throw new Error(`BATCH_LIMIT_EXCEEDED:${MAX_BATCH_JOB_IDS}`);
  }

  const existingRows = await prisma.application.findMany({
    where: {
      candidateId: params.candidateId,
      jobId: { in: orderedUnique },
    },
    select: { jobId: true },
  });
  const existingJobIds = new Set(existingRows.map((r) => r.jobId));

  for (const jobId of orderedUnique) {
    if (existingJobIds.has(jobId)) {
      skippedDuplicates += 1;
      continue;
    }

    const result = await createOneApplication(
      params.session,
      params.candidateId,
      jobId,
      stage
    );

    if (result.status === "created") {
      created += 1;
      applicationIds.push(result.applicationId);
      existingJobIds.add(jobId);
    } else if (result.status === "duplicate") {
      skippedDuplicates += 1;
      existingJobIds.add(jobId);
    }
  }

  return { created, skippedDuplicates, applicationIds };
}

/**
 * Create applications for multiple candidates on one job (bulk shortlist).
 * Skips duplicates (existing candidate+job pair or duplicate ids in request).
 */
export async function batchCreateApplicationsForJob(params: {
  session: Session;
  jobId: string;
  candidateIds: readonly string[];
  stage?: ApplicationStage;
  skipEligibilityCheck?: boolean;
}): Promise<BatchCreateApplicationsForJobResult> {
  const stage = params.stage ?? DEFAULT_STAGE;
  const applicationIds: string[] = [];
  const createdEntries: Array<{ candidateId: string; applicationId: string }> = [];
  let created = 0;
  let skippedDuplicates = 0;
  let skippedNotEligible = 0;
  let skippedOther = 0;

  const seen = new Set<string>();
  const orderedUnique: string[] = [];
  for (const raw of params.candidateIds ?? []) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || !isValidCuid(id)) continue;
    if (seen.has(id)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(id);
    orderedUnique.push(id);
  }

  if (orderedUnique.length > MAX_BATCH_CANDIDATE_IDS) {
    throw new Error(`BATCH_LIMIT_EXCEEDED:${MAX_BATCH_CANDIDATE_IDS}`);
  }

  const seenPersonKeys = new Set<string>();
  const results: BatchShortlistCandidateResult[] = [];

  for (const requestedId of orderedUnique) {
    const profile = await prisma.candidate.findUnique({
      where: { id: requestedId },
      select: { candidateName: true, email: true },
    });
    const personKey = candidateIdentityKey({
      candidateId: requestedId,
      candidateName: profile?.candidateName ?? "",
      email: profile?.email,
    });

    if (seenPersonKeys.has(personKey)) {
      skippedDuplicates += 1;
      results.push({
        candidateId: requestedId,
        status: "duplicate",
        reason: "DUPLICATE_IN_REQUEST",
      });
      continue;
    }
    seenPersonKeys.add(personKey);

    const shortlistResult = await shortlistOneCandidateForJob(
      params.session,
      requestedId,
      params.jobId,
      stage,
      { skipEligibilityCheck: params.skipEligibilityCheck }
    );

    const canonicalId = shortlistResult.canonicalCandidateId ?? requestedId;
    const result = shortlistResult;

    if (result.status === "created" || result.status === "reactivated") {
      created += 1;
      applicationIds.push(result.applicationId!);
      createdEntries.push({
        candidateId: canonicalId,
        applicationId: result.applicationId!,
      });
      results.push({
        candidateId: requestedId,
        status: result.status,
        applicationId: result.applicationId,
        canonicalCandidateId: canonicalId,
      });
    } else if (result.status === "duplicate") {
      skippedDuplicates += 1;
      results.push({
        candidateId: requestedId,
        status: "duplicate",
        reason: "ALREADY_ON_PIPELINE",
        canonicalCandidateId: canonicalId,
      });
    } else if (result.status === "skipped") {
      if (result.reason === "NOT_ELIGIBLE") {
        skippedNotEligible += 1;
      } else {
        skippedOther += 1;
      }
      results.push({
        candidateId: requestedId,
        status: "skipped",
        reason: result.reason,
        canonicalCandidateId: canonicalId,
      });
    }
  }

  return {
    created,
    skippedDuplicates,
    skippedNotEligible,
    skippedInaccessible: 0,
    skippedOther,
    applicationIds,
    createdEntries,
    results,
  };
}

export type BatchCreateApplicationsForJobApiInput = {
  session: Session;
  role: string | undefined;
  userId: string | undefined;
  jobId: string;
  candidateIds: unknown;
  /** When true, skip résumé-parse eligibility (recommendation shortlist). */
  fromRecommendations?: boolean;
};

/** Shared validation for job bulk-shortlist route handlers. */
export async function batchCreateApplicationsForJobFromRequest(
  input: BatchCreateApplicationsForJobApiInput
): Promise<NextResponse | BatchCreateApplicationsForJobResult> {
  const { session, role, userId, jobId } = input;

  if (!isValidCuid(jobId)) {
    return apiError("INVALID_ID", "Malformed job id", 400);
  }

  if (!(await canAccessJobByScope(role, userId, jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this job", 403);
  }

  if (!Array.isArray(input.candidateIds) || input.candidateIds.length === 0) {
    return apiError("VALIDATION_ERROR", "candidateIds must be a non-empty array", 400);
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true },
  });
  if (!job) {
    return apiError("NOT_FOUND", "Job not found", 404);
  }

  const requestedIds = input.candidateIds
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);

  const uniqueRequested = [...new Set(requestedIds)];

  const candidateScope =
    input.fromRecommendations === true
      ? { id: { in: uniqueRequested } }
      : isAdmin(role)
        ? { id: { in: uniqueRequested } }
        : {
            id: { in: uniqueRequested },
            OR: [
              buildCandidateVisibilityWhere(role, userId),
              { applications: { none: {} } },
            ],
          };

  const allowed = await prisma.candidate.findMany({
    where: candidateScope,
    select: { id: true },
  });
  const allowedIds = new Set(allowed.map((c) => c.id));
  const candidateIds = uniqueRequested.filter((id) => allowedIds.has(id));
  const skippedInaccessible = uniqueRequested.length - candidateIds.length;

  if (candidateIds.length === 0) {
    return apiError("VALIDATION_ERROR", "No accessible candidates in candidateIds", 400);
  }

  try {
    const result = await batchCreateApplicationsForJob({
      session,
      jobId,
      candidateIds,
      skipEligibilityCheck: input.fromRecommendations === true,
    });
    return { ...result, skippedInaccessible };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("BATCH_LIMIT_EXCEEDED:")) {
      const limit = msg.split(":")[1] ?? String(MAX_BATCH_CANDIDATE_IDS);
      return apiError(
        "VALIDATION_ERROR",
        `At most ${limit} candidateIds per batch request`,
        400
      );
    }
    throw e;
  }
}

export type BatchCreateApplicationsApiInput = {
  session: Session;
  role: string | undefined;
  userId: string | undefined;
  candidateId: string;
  jobIds: unknown;
};

/** Shared validation for batch route handlers. */
export async function batchCreateApplicationsFromRequest(
  input: BatchCreateApplicationsApiInput
): Promise<NextResponse | BatchCreateApplicationsResult> {
  const { session, role, userId, candidateId } = input;

  if (!isValidCuid(candidateId)) {
    return apiError("INVALID_ID", "Malformed candidate id", 400);
  }

  if (!Array.isArray(input.jobIds) || input.jobIds.length === 0) {
    return apiError("VALIDATION_ERROR", "jobIds must be a non-empty array", 400);
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    return apiError("NOT_FOUND", "Candidate not found", 404);
  }

  const visible = await prisma.candidate.findFirst({
    where: { id: candidateId, ...buildCandidateVisibilityWhere(role, userId) },
    select: { id: true },
  });
  if (!visible) {
    return apiError("FORBIDDEN", "You do not have access to this candidate", 403);
  }

  try {
    return await batchCreateApplications({
      session,
      candidateId,
      jobIds: input.jobIds as string[],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("BATCH_LIMIT_EXCEEDED:")) {
      const limit = msg.split(":")[1] ?? String(MAX_BATCH_JOB_IDS);
      return apiError(
        "VALIDATION_ERROR",
        `At most ${limit} jobIds per batch request`,
        400
      );
    }
    throw e;
  }
}
