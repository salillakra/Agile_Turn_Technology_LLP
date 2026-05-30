import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import { canEditCandidate } from "@/src/lib/rbac";
import { validateApplicationText } from "@/src/lib/application-text-limits";
import { apiError } from "@/src/lib/api-error-response";
import { canAccessJobByScope } from "@/src/lib/rbac-scope";
import { isValidCuid } from "@/src/lib/validate-id";
import { prisma } from "@/src/lib/prisma";
import {
  buildFeedbackAddedDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { clearInterviewReminderEmailsBestEffort } from "@/src/lib/enqueue-interview-reminder";
import { clearInterviewReminderJobs } from "@/src/lib/interview-reminder-integration";
import { scheduleInterviewScheduledCommunications } from "@/src/lib/interview-email-orchestration";
import { scheduleInterviewScheduledEmail } from "@/src/lib/schedule-interview-scheduled-email";
import { scheduleInterviewRemindersAfterInterviewSet } from "@/src/lib/schedule-interview-reminders";

type RouteContext = { params: Promise<{ id: string }> };

const MIN_RATING = 1;
const MAX_RATING = 5;

/**
 * PATCH /api/applications/[id]/feedback — add or update interview feedback (rating 1–5, notes, optional interviewDate).
 * Optional `meetingLink`, `interviewer`, `timeZone` for interview emails.
 * Schedules delayed 24h + 1h reminders (cancelled automatically when `interviewDate` is cleared or changed).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth(canEditCandidate);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const role = session.user?.role;
  const actorUserId = typeof session.user?.id === "string" ? session.user.id : undefined;

  const { id } = await context.params;
  if (!id) return apiError("VALIDATION_ERROR", "Missing id", 400);
  if (!isValidCuid(id)) return apiError("INVALID_ID", "Malformed ID format", 400);

  const application = await prisma.application.findUnique({
    where: { id },
    select: { id: true, jobId: true },
  });
  if (!application) {
    return apiError("NOT_FOUND", "Application not found", 404);
  }
  if (!(await canAccessJobByScope(role, actorUserId, application.jobId))) {
    return apiError("FORBIDDEN", "You do not have access to this application", 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: { rating?: number | null; feedback?: string | null; interviewDate?: Date | null } = {};

  if (body.rating !== undefined) {
    const v = body.rating;
    if (v === null) {
      data.rating = null;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < MIN_RATING || n > MAX_RATING) {
        return apiError(
          "VALIDATION_ERROR",
          `rating must be an integer between ${MIN_RATING} and ${MAX_RATING}`,
          400
        );
      }
      data.rating = n;
    }
  }

  if (body.feedback !== undefined) {
    data.feedback =
      typeof body.feedback === "string" ? body.feedback.trim() || null : null;
  }

  const feedbackError = data.feedback != null ? validateApplicationText("feedback", data.feedback) : null;
  if (feedbackError) {
    return apiError(feedbackError.code, feedbackError.message, 400);
  }

  if (body.interviewDate !== undefined) {
    const v = body.interviewDate;
    if (v === null) {
      data.interviewDate = null;
    } else if (typeof v === "string") {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        return apiError(
          "VALIDATION_ERROR",
          "interviewDate must be a valid ISO date string or null",
          400
        );
      }
      data.interviewDate = d;
    } else {
      return apiError(
        "VALIDATION_ERROR",
        "interviewDate must be a valid ISO date string or null",
        400
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return apiError(
      "VALIDATION_ERROR",
      "At least one of rating, feedback, or interviewDate is required",
      400
    );
  }

  const feedbackDetailsObj = buildFeedbackAddedDetails(data.rating ?? null);
  const feedbackDetailsSerialized = serializeActivityLogDetails(feedbackDetailsObj);
  if (feedbackDetailsSerialized.ok === false) {
    return apiError(
      feedbackDetailsSerialized.code,
      feedbackDetailsSerialized.message,
      400
    );
  }

  const userId = session.user?.id;

  const updated = await prisma.$transaction(async (tx) => {
    const refreshed = await tx.application.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: { candidate: true, job: true },
    });

    if (typeof userId === "string") {
      await tx.activityLog.create({
        data: {
          applicationId: id,
          userId,
          action: "FEEDBACK_ADDED",
          details: feedbackDetailsSerialized.json,
        },
      });
    }

    return refreshed;
  });

  if (data.interviewDate !== undefined) {
    const activeInterview = await prisma.interview.findFirst({
      where: {
        applicationId: id,
        status: { in: ["SCHEDULED", "RESCHEDULED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        interviewers: { select: { userId: true } },
      },
    });

    if (data.interviewDate === null) {
      clearInterviewReminderEmailsBestEffort(id);
      if (activeInterview) {
        void clearInterviewReminderJobs(
          activeInterview.id,
          activeInterview.interviewers.map((row) => row.userId)
        );
      }
    } else {
      const recipient = updated.candidate?.email?.trim();
      const meetingLink =
        typeof body.meetingLink === "string" ? body.meetingLink.trim() : "";
      const interviewer =
        typeof body.interviewer === "string" ? body.interviewer.trim() : "";
      const timeZone =
        typeof body.timeZone === "string" ? body.timeZone.trim() : undefined;

      if (activeInterview) {
        clearInterviewReminderEmailsBestEffort(id);
        scheduleInterviewScheduledCommunications(activeInterview.id);
      } else if (recipient) {
        scheduleInterviewScheduledEmail({
          applicationId: id,
          jobId: updated.jobId,
          recipient,
          candidateName: updated.candidate.candidateName,
          jobTitle: updated.job.title,
          interviewDate: data.interviewDate,
          meetingLink: meetingLink || undefined,
          interviewer: interviewer || undefined,
          timeZone,
        });
        scheduleInterviewRemindersAfterInterviewSet({
          applicationId: id,
          recipient,
          candidateName: updated.candidate.candidateName,
          jobTitle: updated.job.title,
          interviewDate: data.interviewDate,
          meetingLink: meetingLink || undefined,
          interviewer: interviewer || undefined,
          timeZone,
        });
      }
    }
  }

  return NextResponse.json(updated);
}
