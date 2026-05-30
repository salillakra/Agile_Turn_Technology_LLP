import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate, canViewCandidates } from "@/src/lib/rbac";
import { apiError } from "@/src/lib/api-error-response";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { checkInterviewSchedulingApplicationQuota } from "@/src/lib/interview-scheduling-abuse";
import {
  detectInterviewerSchedulingConflicts,
  formatSchedulingConflictMessage,
} from "@/src/lib/interview-scheduling-conflicts";
import { checkInterviewSchedulingRateLimit } from "@/src/lib/interview-scheduling-rate-limit";
import {
  validateInterviewScheduleInput,
  validateInterviewerPanelSize,
} from "@/src/lib/interview-scheduling-validation";
import { scheduleInterviewScheduledCommunications } from "@/src/lib/interview-email-orchestration";
import { logInterviewScheduled } from "@/src/lib/interview-activity-log";
import {
  aggregateInterviewDecision,
  type InterviewFeedbackAggregationInput,
} from "@/src/lib/interview-decision-aggregation";
import type {
  InterviewInterviewerRole,
  InterviewRecommendation,
  InterviewStatus,
} from "@prisma/client";

export const runtime = "nodejs";

const ALLOWED_INTERVIEWER_ROLES: InterviewInterviewerRole[] = [
  "TECHNICAL_INTERVIEWER",
  "HIRING_MANAGER",
  "HR_INTERVIEWER",
];

type InterviewerInput = { userId: string; role: InterviewInterviewerRole };

const ACTIVE_UPCOMING_STATUSES: InterviewStatus[] = ["SCHEDULED", "RESCHEDULED"];

function interviewEndMs(scheduledAt: Date, durationMinutes: number): number {
  return scheduledAt.getTime() + durationMinutes * 60_000;
}

function serializeInterviewTimelineRow(
  row: {
    id: string;
    applicationId: string;
    title: string;
    interviewType: string;
    scheduledAt: Date;
    durationMinutes: number;
    meetingLink: string | null;
    status: InterviewStatus;
    interviewers: Array<{
      userId: string;
      role: InterviewInterviewerRole;
      user: { id: string; name: string | null; email: string };
    }>;
    feedback: Array<{
      id: string;
      reviewerId: string;
      rating: number | null;
      recommendation: InterviewRecommendation;
      strengths: string | null;
      weaknesses: string | null;
      notes: string | null;
      submittedAt: Date;
      reviewer: { id: string; name: string | null; email: string };
    }>;
    application?:
      | {
          id: string;
          candidate: { id: string; candidateName: string | null };
          job: { id: string; title: string };
        }
      | {
          id: string;
        }
      | null;
  },
  viewerUserId: string | undefined,
  nowMs: number
) {
  const feedbackInputs: InterviewFeedbackAggregationInput[] = row.feedback.map((f) => ({
    reviewerId: f.reviewerId,
    reviewerName: f.reviewer.name,
    rating: f.rating,
    recommendation: f.recommendation,
    strengths: f.strengths,
    weaknesses: f.weaknesses,
    notes: f.notes,
  }));

  const decision = aggregateInterviewDecision({
    feedback: feedbackInputs,
    interviewerCount: row.interviewers.length,
  });

  const endMs = interviewEndMs(row.scheduledAt, row.durationMinutes);
  const isUpcoming =
    ACTIVE_UPCOMING_STATUSES.includes(row.status) && endMs > nowMs;

  const myFeedback = viewerUserId
    ? row.feedback.find((f) => f.reviewerId === viewerUserId)
    : undefined;

  return {
    id: row.id,
    applicationId: row.applicationId,
    title: row.title,
    interviewType: row.interviewType,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
    meetingLink: row.meetingLink,
    status: row.status,
    isUpcoming,
    interviewers: row.interviewers.map((i) => ({
      userId: i.userId,
      role: i.role,
      user: i.user,
    })),
    feedback: row.feedback.map((f) => ({
      id: f.id,
      reviewerId: f.reviewerId,
      reviewer: f.reviewer,
      rating: f.rating,
      recommendation: f.recommendation,
      strengths: f.strengths,
      weaknesses: f.weaknesses,
      notes: f.notes,
      submittedAt: f.submittedAt.toISOString(),
    })),
    decision,
    myFeedbackSubmitted: Boolean(myFeedback),
    myFeedbackId: myFeedback?.id ?? null,
    application:
      row.application &&
      typeof row.application === "object" &&
      "candidate" in row.application &&
      "job" in row.application
        ? {
            id: row.application.id,
            candidate: row.application.candidate,
            job: row.application.job,
          }
        : undefined,
  };
}

/**
 * GET /api/interviews?applicationId= | ?jobId=
 *
 * Timeline list for recruiters: interviews with panel, feedback rows, and aggregated decision summary.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const viewerUserId =
    typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("applicationId")?.trim() ?? "";
  const jobId = searchParams.get("jobId")?.trim() ?? "";

  if (!applicationId && !jobId) {
    return apiError(
      "VALIDATION_ERROR",
      "Provide applicationId or jobId query parameter",
      400
    );
  }
  if (applicationId && jobId) {
    return apiError(
      "VALIDATION_ERROR",
      "Provide only one of applicationId or jobId",
      400
    );
  }

  if (applicationId && !isValidCuid(applicationId)) {
    return apiError("INVALID_APPLICATION_ID", "Malformed applicationId", 400);
  }
  if (jobId && !isValidCuid(jobId)) {
    return apiError("INVALID_JOB_ID", "Malformed jobId", 400);
  }

  let scopeJobId: string | null = null;

  if (applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, jobId: true },
    });
    if (!application) {
      return apiError("NOT_FOUND", "Application not found", 404);
    }
    scopeJobId = application.jobId;
  } else if (jobId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) {
      return apiError("NOT_FOUND", "Job not found", 404);
    }
    scopeJobId = job.id;
  }

  if (!scopeJobId || !(await canAccessJobByScope(role, viewerUserId, scopeJobId))) {
    return apiError("FORBIDDEN", "You do not have access to these interviews", 403);
  }

  const interviews = await prisma.interview.findMany({
    where: applicationId
      ? { applicationId }
      : { application: { jobId: jobId! } },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true,
      applicationId: true,
      title: true,
      interviewType: true,
      scheduledAt: true,
      durationMinutes: true,
      meetingLink: true,
      status: true,
      interviewers: {
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      feedback: {
        orderBy: { submittedAt: "asc" },
        select: {
          id: true,
          reviewerId: true,
          rating: true,
          recommendation: true,
          strengths: true,
          weaknesses: true,
          notes: true,
          submittedAt: true,
          reviewer: { select: { id: true, name: true, email: true } },
        },
      },
      application: jobId
        ? {
            select: {
              id: true,
              candidate: { select: { id: true, candidateName: true } },
              job: { select: { id: true, title: true } },
            },
          }
        : false,
    },
  });

  const nowMs = Date.now();
  const rows = interviews.map((row) =>
    serializeInterviewTimelineRow(row, viewerUserId, nowMs)
  );
  const upcoming = rows.filter((r) => r.isUpcoming);
  const past = rows.filter((r) => !r.isUpcoming);

  return NextResponse.json({
    applicationId: applicationId || null,
    jobId: jobId || null,
    interviews: rows,
    upcoming,
    past,
  });
}

/**
 * POST /api/interviews
 *
 * Responsibilities:
 * 1. Create interview.
 * 2. Assign interviewers.
 * 3. Validate application existence + scope access.
 * 4. Validate scheduling fields (future dates, duration, meeting links).
 * 5. Rate limit + per-application quotas (abuse protection).
 *
 * Input:
 * - applicationId (cuid)
 * - scheduledAt (ISO string)
 * - durationMinutes (int)
 * - interviewers[]: { userId, role }
 * - meetingLink (optional)
 *
 * After create: `scheduleInterviewScheduledCommunications` enqueues immediate emails and
 * BullMQ delayed 24h + 1h reminders (`interview_reminder` / `interview_reminder_interviewer`)
 * for the candidate and each assigned interviewer (requires Redis + `npm run worker`).
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const role = auth.session.user?.role;
  const actorUserId = typeof auth.session.user?.id === "string" ? auth.session.user.id : undefined;

  const rateLimited = await checkInterviewSchedulingRateLimit(actorUserId);
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
  if (!applicationId || !isValidCuid(applicationId)) {
    return apiError("INVALID_APPLICATION_ID", "applicationId is required", 400);
  }

  const scheduleValidation = validateInterviewScheduleInput({
    scheduledAt: body.scheduledAt,
    durationMinutes: body.durationMinutes,
    meetingLink: body.meetingLink,
  });
  if (scheduleValidation.ok === false) {
    const { code, message, status, details } = scheduleValidation.error;
    return apiError(code, message, status, details);
  }
  const { scheduledAt, durationMinutes, meetingLink } = scheduleValidation.value;

  const interviewersRaw = body.interviewers;
  if (!Array.isArray(interviewersRaw)) {
    return apiError(
      "VALIDATION_ERROR",
      "interviewers is required and must be an array of { userId, role }",
      400
    );
  }

  const interviewers: InterviewerInput[] = [];
  for (const entry of interviewersRaw) {
    const e = entry as Record<string, unknown>;
    const userId = typeof e?.userId === "string" ? e.userId.trim() : "";
    const roleRaw = typeof e?.role === "string" ? e.role.trim() : "";
    const roleValue = (ALLOWED_INTERVIEWER_ROLES as readonly string[]).includes(roleRaw)
      ? (roleRaw as InterviewInterviewerRole)
      : null;
    if (!userId || !isValidCuid(userId) || !roleValue) {
      return apiError(
        "VALIDATION_ERROR",
        "Each interviewer must be { userId: cuid, role: TECHNICAL_INTERVIEWER | HIRING_MANAGER | HR_INTERVIEWER }",
        400
      );
    }
    interviewers.push({ userId, role: roleValue });
  }

  if (interviewers.length === 0) {
    return apiError("VALIDATION_ERROR", "At least one interviewer is required", 400);
  }

  const panelError = validateInterviewerPanelSize(interviewers.length);
  if (panelError) {
    return apiError(panelError.code, panelError.message, panelError.status, panelError.details);
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, jobId: true, candidateId: true },
  });
  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }
  if (!(await canAccessJobByScope(role, actorUserId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application", 403);
  }

  const uniqueUserIds = [...new Set(interviewers.map((i) => i.userId))];
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true },
  });
  if (existingUsers.length !== uniqueUserIds.length) {
    const existingSet = new Set(existingUsers.map((u) => u.id));
    const missing = uniqueUserIds.filter((id) => !existingSet.has(id));
    return apiError("INVALID_INTERVIEWER", "One or more interviewer userId values are invalid", 400, {
      missingUserIds: missing,
    });
  }

  if (!actorUserId) {
    return apiError("UNAUTHORIZED", "Missing user session", 401);
  }

  const quotaError = await checkInterviewSchedulingApplicationQuota(applicationId);
  if (quotaError) {
    return apiError(
      quotaError.code,
      quotaError.message,
      quotaError.status,
      quotaError.details
    );
  }

  const schedulingConflicts = await detectInterviewerSchedulingConflicts({
    interviewerUserIds: uniqueUserIds,
    scheduledAt,
    durationMinutes,
  });
  if (schedulingConflicts.length > 0) {
    return apiError(
      "SCHEDULING_CONFLICT",
      formatSchedulingConflictMessage(schedulingConflicts),
      409,
      { conflicts: schedulingConflicts }
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        applicationId,
        title: "Interview",
        description: null,
        interviewType: "INTERVIEW",
        scheduledAt,
        durationMinutes,
        meetingLink,
        status: "SCHEDULED",
        notes: null,
        createdBy: actorUserId,
        interviewers: {
          createMany: {
            data: interviewers.map((i) => ({
              userId: i.userId,
              role: i.role,
            })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        interviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    return interview;
  });

  scheduleInterviewScheduledCommunications(created.id);

  void logInterviewScheduled({
    interviewId: created.id,
    applicationId,
    candidateId: application.candidateId,
    userId: actorUserId,
    scheduledAt,
    durationMinutes,
    interviewerUserIds: uniqueUserIds,
  });

  return NextResponse.json(created, { status: 201 });
}

