import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canMutatePipeline, canTransitionStage } from "@/src/lib/rbac";
import { isValidStageTransition } from "@/src/lib/application-stage-transitions";
import { validateApplicationText } from "@/src/lib/application-text-limits";
import { apiError } from "@/src/lib/api-error-response";
import { checkApplicationMutationRateLimit } from "@/src/lib/rate-limit";
import { isValidCuid } from "@/src/lib/validate-id";
import {
  buildStageChangeDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import {
  invalidateCandidateScoringCaches,
  invalidateJobCandidateScoringCaches,
} from "@/src/lib/ai/candidate-scoring-cache";
import { invalidateJobRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";
import { invalidateCandidateRecommendedCandidatesCaches } from "@/src/lib/job-recommended-candidates-cache";
import {
  notifyAssignedInterviewersForInterviewStage,
  notifyHiringManagersStageChanged,
  notifyJobStakeholdersOfferSent,
  scheduleNotificationWork,
} from "@/src/lib/notification-service";
import { scheduleCandidateStageChangeEmail } from "@/src/lib/schedule-candidate-stage-email";
import { scheduleOfferSentEmail } from "@/src/lib/schedule-offer-sent-email";
import { shouldNotifyStageChangeInApp } from "@/src/lib/notification-stage-policy";
import { syncCrmClosureForHiredApplication } from "@/src/lib/crm/crm-closure-sync";
import type { ApplicationStage } from "@prisma/client";

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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/applications/[id]/stage — move application to a new stage.
 * When stage is REJECTED, optional rejectionReason is accepted and persisted.
 * Creates ActivityLog STAGE_CHANGE. Blocked if already HIRED or REJECTED.
 *
 * **Candidate email (async):** After a successful commit, {@link scheduleCandidateStageChangeEmail}
 * enqueues a BullMQ job via `after()` so the JSON response is not blocked by Redis/SMTP.
 * The `npm run worker` email worker sends the message later.
 *
 * In-app notifications run only when persisted `stage` changes (see `oldStage` vs `newStage`).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canMutatePipeline);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const actorUserId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const rateLimitRes = checkApplicationMutationRateLimit(session.user?.id);
  if (rateLimitRes) return rateLimitRes;

  const { id } = await context.params;
  if (!id) return apiError("VALIDATION_ERROR", "Missing id", 400);
  if (!isValidCuid(id)) return apiError("INVALID_ID", "Malformed ID format", 400);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const stageRaw = body.stage;
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

  const rejectionReasonRaw = body.rejectionReason;
  const rejectionReason =
    rejectionReasonRaw === undefined
      ? undefined
      : typeof rejectionReasonRaw === "string"
        ? rejectionReasonRaw.trim() || null
        : null;

  const expectedVersion = body.version;
  if (expectedVersion === undefined || expectedVersion === null) {
    return apiError("VALIDATION_ERROR", "version is required for optimistic locking", 400);
  }
  const versionNum =
    typeof expectedVersion === "number" && Number.isInteger(expectedVersion) && expectedVersion >= 0
      ? expectedVersion
      : null;
  if (versionNum === null) {
    return apiError("VALIDATION_ERROR", "version must be a non-negative integer", 400);
  }

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true, stage: true, version: true, jobId: true },
  });
  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }

  if (!(await canAccessJobByScope(role, actorUserId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application's job", 403);
  }

  /** Stage before this PATCH; paired with `newStage` for `shouldNotifyStageChangeInApp` (no no-ops). */
  const oldStage = application.stage;

  if (application.stage === "HIRED" || application.stage === "REJECTED") {
    return apiError(
      "FORBIDDEN",
      "Cannot change stage for applications that are already HIRED or REJECTED",
      403
    );
  }

  if (!isValidStageTransition(application.stage, stage)) {
    return apiError(
      "INVALID_STAGE_TRANSITION",
      `Transition from ${application.stage} to ${stage} is not allowed. Use the defined pipeline progression or REJECTED from any stage.`,
      400,
      { fromStage: application.stage, toStage: stage }
    );
  }
  if (!canTransitionStage(role, application.stage, stage)) {
    return apiError(
      "FORBIDDEN",
      `Role ${role ?? "UNKNOWN"} cannot transition from ${application.stage} to ${stage}`,
      403
    );
  }

  const data: {
    stage: ApplicationStage;
    rejectionReason?: string | null;
    offerSentAt?: Date;
    hiredAt?: Date;
    version: { increment: number };
  } = { stage, version: { increment: 1 } };
  if (stage === "REJECTED") {
    data.rejectionReason = rejectionReason !== undefined ? rejectionReason : null;
    const rejectionError = validateApplicationText("rejectionReason", data.rejectionReason);
    if (rejectionError) {
      return apiError(rejectionError.code, rejectionError.message, 400);
    }
  }
  if (stage === "OFFER_SENT") {
    data.offerSentAt = new Date();
  }
  if (stage === "HIRED") {
    data.hiredAt = new Date();
  }

  const stageChangeDetailsObj = buildStageChangeDetails(
    application.stage,
    stage,
    stage === "REJECTED" ? data.rejectionReason ?? null : undefined
  );
  const stageChangeDetailsSerialized = serializeActivityLogDetails(stageChangeDetailsObj);
  if (stageChangeDetailsSerialized.ok === false) {
    return apiError(stageChangeDetailsSerialized.code, stageChangeDetailsSerialized.message, 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.application.updateMany({
      where: { id, version: versionNum },
      data,
    });

    if (updateResult.count === 0) {
      return null;
    }

    const refreshed = await tx.application.findUnique({
      where: { id },
      include: { candidate: true, job: true },
    });
    if (!refreshed) {
      return null;
    }

    const userId = session.user?.id;
    if (typeof userId === "string") {
      await tx.activityLog.create({
        data: {
          applicationId: id,
          userId,
          action: "STAGE_CHANGE",
          details: stageChangeDetailsSerialized.json,
        },
      });
    }

    return refreshed;
  });

  if (!updated) {
    return apiError(
      "CONFLICT",
      "Application was updated by another request. Refresh and try again.",
      409
    );
  }

  const newStage = updated.stage;

  void invalidateJobRecommendedCandidatesCaches(updated.jobId);
  void invalidateJobCandidateScoringCaches(updated.jobId);
  void invalidateCandidateRecommendedCandidatesCaches(updated.candidate.id);
  void invalidateCandidateScoringCaches(updated.candidate.id);

  /**
   * In-app notifications only after a successful transaction above (so DB and `ActivityLog`
   * match what we announce). Recipients get `createNotification(userId, "STAGE_CHANGED", …)`
   * via {@link notifyHiringManagersStageChanged} (see `notification-service.ts`).
   *
   * Notify only when the transition is meaningful (not no-op; must be a valid pipeline move per
   * `shouldNotifyStageChangeInApp` / `isValidStageTransition`).
   */
  if (shouldNotifyStageChangeInApp(oldStage, newStage)) {
    scheduleNotificationWork(
      notifyHiringManagersStageChanged({
        applicationId: updated.id,
        candidateId: updated.candidate.id,
        fromStage: oldStage,
        toStage: newStage,
        jobId: updated.jobId,
        jobTitle: updated.job.title,
        candidateName: updated.candidate.candidateName,
        actorUserId,
      })
    );
    scheduleCandidateStageChangeEmail({
      candidateEmail: updated.candidate.email,
      candidateName: updated.candidate.candidateName,
      applicationId: updated.id,
      jobTitle: updated.job.title,
      fromStage: oldStage,
      toStage: newStage,
    });
    if (newStage === "INTERVIEW") {
      scheduleNotificationWork(
        notifyAssignedInterviewersForInterviewStage({
          applicationId: updated.id,
          jobId: updated.jobId,
          jobTitle: updated.job.title,
          candidateName: updated.candidate.candidateName,
          actorUserId,
        })
      );
    }
    if (newStage === "OFFER_SENT") {
      scheduleNotificationWork(
        notifyJobStakeholdersOfferSent({
          applicationId: updated.id,
          jobId: updated.jobId,
          jobTitle: updated.job.title,
          candidateName: updated.candidate.candidateName,
          actorUserId,
        })
      );
      scheduleOfferSentEmail({
        candidateEmail: updated.candidate.email,
        candidateName: updated.candidate.candidateName,
        applicationId: updated.id,
        jobTitle: updated.job.title,
      });
    }
    if (newStage === "HIRED") {
      void syncCrmClosureForHiredApplication(updated.id).catch((e) => {
        console.error("[PATCH /api/applications/[id]/stage] CRM closure sync failed:", e);
      });
    }
  }

  return NextResponse.json(updated);
}
