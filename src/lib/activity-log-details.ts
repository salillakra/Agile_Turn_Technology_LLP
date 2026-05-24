import type { ApplicationStage } from "@prisma/client";

export type StageChangeDetails = {
  from: ApplicationStage;
  to: ApplicationStage;
  reason?: string;
};

export type FeedbackAddedDetails = {
  rating: number | null;
};

export type NotesUpdatedDetails = {
  summary: string;
};

export type ApplicationCreatedDetails = {
  jobId: string;
};

export type ApplicationDeletedDetails = {
  reason?: string;
};

/** Correlates ActivityLog rows with `ResumeParseJob` lifecycle (parse pipeline). */
export type ResumeParseJobActivityDetails = {
  resumeParseJobId: string;
  fileHash: string;
};

export type ResumeParseFailedDetails = ResumeParseJobActivityDetails & {
  error: string;
};

/** Recruiter confirmed applying parsed résumé fields to `Candidate`. */
export type ResumeParseAppliedToCandidateDetails = ResumeParseJobActivityDetails;

/** Details for `ActivityLog.action === "NOTIFICATION_SENT"` when pipeline stage-change in-app alerts are persisted. */
export type StageChangeNotificationSentDetails = {
  kind: "STAGE_CHANGED";
  fromStage: string;
  toStage: string;
  recipientCount: number;
  jobId: string;
};

/** `ActivityLog.action` when in-app notifications are recorded for auditing (e.g. stage-change alerts). */
export const ACTIVITY_ACTION_NOTIFICATION_SENT = "NOTIFICATION_SENT" as const;

export const MAX_ACTIVITY_LOG_DETAILS_LENGTH = 5000;

export function buildStageChangeDetails(
  from: ApplicationStage,
  to: ApplicationStage,
  reason?: string | null
): StageChangeDetails {
  const details: StageChangeDetails = { from, to };
  if (reason != null && reason !== "") details.reason = reason;
  return details;
}

export function buildFeedbackAddedDetails(rating?: number | null): FeedbackAddedDetails {
  return { rating: rating ?? null };
}

export function buildNotesUpdatedDetails(summary: string): NotesUpdatedDetails {
  return { summary };
}

export function buildApplicationCreatedDetails(jobId: string): ApplicationCreatedDetails {
  return { jobId };
}

export function buildApplicationDeletedDetails(reason?: string | null): ApplicationDeletedDetails {
  const details: ApplicationDeletedDetails = {};
  if (reason != null && reason !== "") details.reason = reason;
  return details;
}

export function buildResumeParseJobActivityDetails(
  resumeParseJobId: string,
  fileHash: string
): ResumeParseJobActivityDetails {
  return { resumeParseJobId, fileHash };
}

export function buildResumeParseFailedDetails(
  resumeParseJobId: string,
  fileHash: string,
  error: string
): ResumeParseFailedDetails {
  return { resumeParseJobId, fileHash, error };
}

export function buildResumeParseAppliedToCandidateDetails(
  resumeParseJobId: string,
  fileHash: string
): ResumeParseAppliedToCandidateDetails {
  return { resumeParseJobId, fileHash };
}

export function buildStageChangeNotificationSentDetails(
  fromStage: string,
  toStage: string,
  recipientCount: number,
  jobId: string
): StageChangeNotificationSentDetails {
  return { kind: "STAGE_CHANGED", fromStage, toStage, recipientCount, jobId };
}

export function serializeActivityLogDetails(
  detailsObj: unknown,
  maxLength: number = MAX_ACTIVITY_LOG_DETAILS_LENGTH
): { ok: true; json: string } | { ok: false; code: "DETAILS_TOO_LARGE"; message: string } {
  const json = JSON.stringify(detailsObj);
  if (json.length > maxLength) {
    return {
      ok: false,
      code: "DETAILS_TOO_LARGE",
      message: `ActivityLog details exceeds maximum allowed length (${maxLength})`,
    };
  }
  return { ok: true, json };
}

