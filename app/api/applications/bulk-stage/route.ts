import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canMutatePipeline, canTransitionStage } from "@/src/lib/rbac";
import { isValidStageTransition } from "@/src/lib/application-stage-transitions";
import { apiError } from "@/src/lib/api-error-response";
import { checkApplicationMutationRateLimit } from "@/src/lib/rate-limit";
import { isValidCuid } from "@/src/lib/validate-id";
import { prisma } from "@/src/lib/prisma";
import { isAdmin } from "@/src/lib/rbac";
import {
  notifyAssignedInterviewersForInterviewStage,
  notifyHiringManagersStageChanged,
  notifyJobStakeholdersOfferSent,
  scheduleNotificationWork,
} from "@/src/lib/notification-service";
import { scheduleCandidateStageChangeEmail } from "@/src/lib/schedule-candidate-stage-email";
import { scheduleOfferSentEmail } from "@/src/lib/schedule-offer-sent-email";
import { syncCrmClosureForHiredApplication } from "@/src/lib/crm/crm-closure-sync";
import { shouldNotifyStageChangeInApp } from "@/src/lib/notification-stage-policy";
import type { ApplicationStage } from "@prisma/client";
import {
  buildStageChangeDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import {
  invalidateCandidateScoringCaches,
  invalidateJobCandidateScoringCaches,
} from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateJobRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";

const ALLOWED_STAGES: ApplicationStage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
];

const MAX_BULK_APPLICATIONS = 200;

/**
 * POST /api/applications/bulk-stage — move multiple applications to a stage.
 * Body: { applicationIds: string[], stage: ApplicationStage }. Max 200 applicationIds per request. Duplicate ids are deduplicated; each application is updated and logged once. Skips applications already HIRED/REJECTED.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canMutatePipeline);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const userId = typeof session.user?.id === "string" ? session.user.id : "";

  const rateLimitRes = checkApplicationMutationRateLimit(session.user?.id);
  if (rateLimitRes) return rateLimitRes;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const applicationIdsRaw = body.applicationIds;
  const stageRaw = body.stage;

  if (!Array.isArray(applicationIdsRaw)) {
    return apiError("VALIDATION_ERROR", "applicationIds must be an array", 400);
  }

  const applicationIds: string[] = applicationIdsRaw.every(
    (id): id is string => typeof id === "string"
  )
    ? applicationIdsRaw.filter((id) => id.trim() !== "")
    : [];

  if (applicationIds.length === 0) {
    return apiError(
      "VALIDATION_ERROR",
      "applicationIds must be a non-empty array of strings",
      400
    );
  }

  if (applicationIds.length > MAX_BULK_APPLICATIONS) {
    return apiError(
      "BULK_LIMIT_EXCEEDED",
      "Maximum 200 applications allowed per bulk update",
      400
    );
  }

  const uniqueApplicationIds = [...new Set(applicationIds)];
  const invalidIds = uniqueApplicationIds.filter((id) => !isValidCuid(id));
  if (invalidIds.length > 0) {
    return apiError("INVALID_ID", "Malformed ID format", 400, { invalidIds });
  }

  const stage =
    typeof stageRaw === "string" && (ALLOWED_STAGES as string[]).includes(stageRaw)
      ? (stageRaw as ApplicationStage)
      : null;

  if (!stage) {
    return apiError(
      "VALIDATION_ERROR",
      "stage is required and must be one of: APPLIED, SCREENING, INTERVIEW, TECHNICAL, FINAL_ROUND, OFFER_SENT, HIRED, REJECTED",
      400
    );
  }

  const applications = await prisma.application.findMany({
    where: { id: { in: uniqueApplicationIds } },
    select: { id: true, stage: true, rejectionReason: true, jobId: true },
  });

  const foundIds = new Set(applications.map((a) => a.id));
  const missingIds = uniqueApplicationIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    return apiError(
      "NOT_FOUND",
      "One or more applications not found",
      404,
      { missingIds }
    );
  }

  const scoped = applications;
  const allowedJobIds = isAdmin(role)
    ? null
    : new Set(
        (
          await prisma.jobAssignment.findMany({
            where: { userId },
            select: { jobId: true },
            distinct: ["jobId"],
          })
        ).map((r) => r.jobId)
      );
  const scopeFiltered =
    allowedJobIds == null
      ? scoped
      : scoped.filter((a) => allowedJobIds.has(a.jobId));
  if (scopeFiltered.length === 0) {
    return apiError("FORBIDDEN", "No access to selected applications", 403);
  }

  const eligible = scopeFiltered.filter((a) => a.stage !== "HIRED" && a.stage !== "REJECTED");
  if (eligible.length === 0) {
    return apiError(
      "FORBIDDEN",
      "No applications eligible for stage change (all are HIRED or REJECTED)",
      403
    );
  }

  const invalidTransitions = eligible.filter(
    (a) => !isValidStageTransition(a.stage, stage)
  );
  if (invalidTransitions.length > 0) {
    return apiError(
      "INVALID_STAGE_TRANSITION",
      "One or more applications have an invalid transition. Use the defined pipeline progression or REJECTED from any stage.",
      400,
      {
        invalidTransitions: invalidTransitions.map((a) => ({
          applicationId: a.id,
          fromStage: a.stage,
          toStage: stage,
        })),
      }
    );
  }
  const roleBlocked = eligible.filter((a) => !canTransitionStage(role, a.stage, stage));
  if (roleBlocked.length > 0) {
    return apiError(
      "FORBIDDEN",
      "Your role cannot perform one or more requested stage transitions",
      403,
      {
        blocked: roleBlocked.map((a) => ({
          applicationId: a.id,
          fromStage: a.stage,
          toStage: stage,
        })),
      }
    );
  }

  const detailsByApplicationId: Record<string, string> = {};
  for (const app of eligible) {
    const detailsObj = buildStageChangeDetails(
      app.stage,
      stage,
      stage === "REJECTED" ? app.rejectionReason ?? null : undefined
    );
    const serialized = serializeActivityLogDetails(detailsObj);
    if (serialized.ok === false) {
      return apiError(serialized.code, serialized.message, 400);
    }
    detailsByApplicationId[app.id] = serialized.json;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const app of eligible) {
      const data: {
        stage: ApplicationStage;
        offerSentAt?: Date;
        hiredAt?: Date;
        version: { increment: number };
      } = {
        stage,
        version: { increment: 1 },
      };
      if (stage === "OFFER_SENT") {
        data.offerSentAt = new Date();
      }
      if (stage === "HIRED") {
        data.hiredAt = new Date();
      }
      const u = await tx.application.update({
        where: { id: app.id },
        data,
        include: { candidate: true, job: true },
      });
      results.push(u);
      if (typeof userId === "string") {
        await tx.activityLog.create({
          data: {
            applicationId: app.id,
            userId,
            action: "STAGE_CHANGE",
            details: detailsByApplicationId[app.id],
          },
        });
      }
    }
    return results;
  });

  const actorUserId = typeof userId === "string" ? userId : undefined;

  const jobIds = new Set<string>();
  const candidateIds = new Set<string>();
  for (const u of updated) {
    jobIds.add(u.jobId);
    candidateIds.add(u.candidate.id);
  }
  for (const jobId of jobIds) {
    void invalidateJobRecommendedCandidatesCaches(jobId);
    void invalidateJobCandidateScoringCaches(jobId);
  }
  for (const candidateId of candidateIds) {
    void invalidateCandidateRecommendedCandidatesCaches(candidateId);
    void invalidateCandidateScoringCaches(candidateId);
  }

  for (const u of updated) {
    const prev = eligible.find((e) => e.id === u.id);
    if (!prev) continue;
    if (!shouldNotifyStageChangeInApp(prev.stage, stage)) {
      continue;
    }
    scheduleNotificationWork(
      notifyHiringManagersStageChanged({
        applicationId: u.id,
        candidateId: u.candidate.id,
        fromStage: prev.stage,
        toStage: stage,
        jobId: u.jobId,
        jobTitle: u.job.title,
        candidateName: u.candidate.candidateName,
        actorUserId,
      })
    );
    scheduleCandidateStageChangeEmail({
      candidateEmail: u.candidate.email,
      candidateName: u.candidate.candidateName,
      applicationId: u.id,
      jobTitle: u.job.title,
      fromStage: prev.stage,
      toStage: stage,
    });
    if (stage === "INTERVIEW") {
      scheduleNotificationWork(
        notifyAssignedInterviewersForInterviewStage({
          applicationId: u.id,
          jobId: u.jobId,
          jobTitle: u.job.title,
          candidateName: u.candidate.candidateName,
          actorUserId,
        })
      );
    }
    if (stage === "OFFER_SENT") {
      scheduleNotificationWork(
        notifyJobStakeholdersOfferSent({
          applicationId: u.id,
          jobId: u.jobId,
          jobTitle: u.job.title,
          candidateName: u.candidate.candidateName,
          actorUserId,
        })
      );
      scheduleOfferSentEmail({
        candidateEmail: u.candidate.email,
        candidateName: u.candidate.candidateName,
        applicationId: u.id,
        jobTitle: u.job.title,
      });
    }
    if (stage === "HIRED") {
      void syncCrmClosureForHiredApplication(u.id).catch((e) => {
        console.error("[POST /api/applications/bulk-stage] CRM closure sync failed:", e);
      });
    }
  }

  return NextResponse.json(updated);
}
