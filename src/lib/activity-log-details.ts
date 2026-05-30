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

/** Outbound email delivered successfully (worker / SMTP). */
export const ACTIVITY_ACTION_EMAIL_SENT = "EMAIL_SENT" as const;

/** Outbound email permanently failed (retries exhausted, skip, or unrecoverable). */
export const ACTIVITY_ACTION_EMAIL_FAILED = "EMAIL_FAILED" as const;

/** Interview reminder email delivered (`template === interview_reminder`). */
export const ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT = "INTERVIEW_REMINDER_SENT" as const;

/** Interview round was created and scheduled. */
export const ACTIVITY_ACTION_INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED" as const;

/** Interview was rescheduled (new schedule differs from prior schedule). */
export const ACTIVITY_ACTION_INTERVIEW_RESCHEDULED = "INTERVIEW_RESCHEDULED" as const;

/** Interview was cancelled (soft cancel; interview row retained). */
export const ACTIVITY_ACTION_INTERVIEW_CANCELLED = "INTERVIEW_CANCELLED" as const;

/** Structured interview feedback submitted (`ActivityLog.interviewerId` = reviewer). */
export const ACTIVITY_ACTION_FEEDBACK_SUBMITTED = "FEEDBACK_SUBMITTED" as const;

/** @deprecated Use {@link ACTIVITY_ACTION_FEEDBACK_SUBMITTED} (same action string). */
export const ACTIVITY_ACTION_INTERVIEW_FEEDBACK_SUBMITTED = ACTIVITY_ACTION_FEEDBACK_SUBMITTED;

/** Panel / interview lifecycle actions indexed on `ActivityLog.interviewId`. */
export const INTERVIEW_ACTIVITY_ACTIONS = [
  ACTIVITY_ACTION_INTERVIEW_SCHEDULED,
  ACTIVITY_ACTION_INTERVIEW_RESCHEDULED,
  ACTIVITY_ACTION_INTERVIEW_CANCELLED,
  ACTIVITY_ACTION_FEEDBACK_SUBMITTED,
] as const;

export type InterviewActivityAction = (typeof INTERVIEW_ACTIVITY_ACTIONS)[number];

export function isInterviewActivityAction(action: string): action is InterviewActivityAction {
  return (INTERVIEW_ACTIVITY_ACTIONS as readonly string[]).includes(action);
}

/** JSON `details` for {@link ACTIVITY_ACTION_EMAIL_SENT}, {@link ACTIVITY_ACTION_EMAIL_FAILED}, {@link ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT}. */
export type EmailActivityDetails = {
  recipient: string;
  /** Queue template key (email type). */
  emailType: string;
  applicationId?: string;
  jobId?: string;
  jobTitle?: string;
  /** BullMQ job id for correlation with `EmailLog`. */
  bullmqJobId?: string;
  /** Present on {@link ACTIVITY_ACTION_EMAIL_FAILED}. */
  error?: string;
  /** Present on {@link ACTIVITY_ACTION_INTERVIEW_REMINDER_SENT} when scheduled lead is known. */
  reminderLeadHours?: number;
};

/** Recommendation engine produced ranked roles for a candidate. */
export const ACTIVITY_ACTION_RECOMMENDATION_GENERATED = "RECOMMENDATION_GENERATED" as const;

/** Recruiter applied to one or more recommended roles (batch accept). */
export const ACTIVITY_ACTION_RECOMMENDATION_ACCEPTED = "RECOMMENDATION_ACCEPTED" as const;

/** Job→candidate engine surfaced a ranked candidate to a recruiter. */
export const ACTIVITY_ACTION_CANDIDATE_RECOMMENDED = "CANDIDATE_RECOMMENDED" as const;

/** Recruiter shortlisted a recommended candidate (application created for the job). */
export const ACTIVITY_ACTION_CANDIDATE_SHORTLISTED = "CANDIDATE_SHORTLISTED" as const;
/** AI candidate scoring run produced a scored candidate row for a job. */
export const ACTIVITY_ACTION_CANDIDATE_SCORED = "CANDIDATE_SCORED" as const;
/** AI scoring found a high-fit candidate for a job (threshold-based). */
export const ACTIVITY_ACTION_HIGH_MATCH_FOUND = "HIGH_MATCH_FOUND" as const;

/** Recruiter viewed / interacted with AI candidate score results for a job. */
export const ACTIVITY_ACTION_AI_CANDIDATE_SCORE_INTERACTION =
  "AI_CANDIDATE_SCORE_INTERACTION" as const;

export type AiCandidateScoreInteractionDetails = {
  jobId: string;
  candidateId: string;
  interactionType:
    | "RESULT_IMPRESSION"
    | "VIEW_PROFILE"
    | "ADD_PIPELINE"
    | "SHORTLIST"
    | "IGNORED"
    | "REJECTED";
  candidateFitScore?: number;
  semanticScore?: number;
  rankPosition?: number;
  /** Optional freeform reason for reject/dismiss (UI-driven). */
  reason?: string;
};

export type InterviewRescheduledDetails = {
  applicationId: string;
  interviewId: string;
  /** Subject interviewer when the event targets one person; null for panel-wide reschedule. */
  interviewerId: string | null;
  fromScheduledAt: string;
  toScheduledAt: string;
  fromDurationMinutes: number;
  toDurationMinutes: number;
};

export type InterviewCancelledDetails = {
  applicationId: string;
  interviewId: string;
  interviewerId: string | null;
  previousStatus: string;
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
};

export type InterviewScheduledDetails = {
  applicationId: string;
  interviewId: string;
  interviewerId: string | null;
  scheduledAt: string;
  durationMinutes: number;
  interviewerUserIds: string[];
};

export type InterviewFeedbackSubmittedDetails = {
  applicationId: string;
  interviewId: string;
  interviewerId: string;
  reviewerId: string;
  rating: number | null;
  recommendation: string;
};

export function buildInterviewFeedbackSubmittedDetails(input: {
  interviewId: string;
  applicationId: string;
  reviewerId: string;
  rating: number | null;
  recommendation: string;
}): InterviewFeedbackSubmittedDetails {
  const reviewerId = input.reviewerId.trim();
  return {
    interviewId: input.interviewId.trim(),
    applicationId: input.applicationId.trim(),
    interviewerId: reviewerId,
    reviewerId,
    rating: input.rating,
    recommendation: input.recommendation.trim(),
  };
}

export function buildInterviewScheduledDetails(input: {
  interviewId: string;
  applicationId: string;
  scheduledAt: Date;
  durationMinutes: number;
  interviewerUserIds: readonly string[];
}): InterviewScheduledDetails {
  return {
    interviewId: input.interviewId.trim(),
    applicationId: input.applicationId.trim(),
    interviewerId: null,
    scheduledAt: input.scheduledAt.toISOString(),
    durationMinutes: Math.max(0, Math.trunc(input.durationMinutes)),
    interviewerUserIds: [...input.interviewerUserIds],
  };
}

/** Recruiter ran AI semantic candidate search — session summary (`POST /api/search/candidates`). */
export const ACTIVITY_ACTION_AI_SEARCH_PERFORMED = "AI_SEARCH_PERFORMED" as const;

/** One candidate row returned and ranked by AI search for a query. */
export const ACTIVITY_ACTION_CANDIDATE_AI_MATCHED = "CANDIDATE_AI_MATCHED" as const;

/** @deprecated Prefer {@link ACTIVITY_ACTION_AI_SEARCH_PERFORMED}. */
export const ACTIVITY_ACTION_RECRUITER_AI_SEARCH_EXECUTED = "RECRUITER_AI_SEARCH_EXECUTED" as const;

/** Recruiter clicked a search result (view profile, pipeline, shortlist). */
export const ACTIVITY_ACTION_RECRUITER_AI_SEARCH_RESULT_CLICKED =
  "RECRUITER_AI_SEARCH_RESULT_CLICKED" as const;

/** Recruiter added a search result to a job pipeline (shortlist). */
export const ACTIVITY_ACTION_RECRUITER_AI_SEARCH_SHORTLISTED =
  "RECRUITER_AI_SEARCH_SHORTLISTED" as const;

export type AiSearchTopResultRef = {
  candidateId: string;
  candidateName: string;
};

/** `ActivityLog.details` for {@link ACTIVITY_ACTION_AI_SEARCH_PERFORMED}. */
export type AiSearchPerformedDetails = {
  searchId: string;
  query: string;
  /** Highest-ranked candidate for this search, if any. */
  topResult: AiSearchTopResultRef | null;
  /** Hybrid `finalScore` of top result (0–100). */
  similarityScore: number;
  /** Semantic component of top result (0–100), when available. */
  semanticScore?: number;
  resultCount: number;
  success: boolean;
  durationMs?: number;
  querySkillTokens?: string[];
};

/** `ActivityLog.details` for {@link ACTIVITY_ACTION_CANDIDATE_AI_MATCHED}. */
export type CandidateAiMatchedDetails = {
  searchId: string;
  query: string;
  candidateId: string;
  candidateName: string;
  /** Hybrid `finalScore` for this row (0–100). */
  similarityScore: number;
  semanticScore?: number;
  rankPosition: number;
};

export type RecruiterAiSearchExecutedDetails = {
  searchId: string;
  query: string;
  querySkillTokens: string[];
  resultCount: number;
  success: boolean;
  durationMs?: number;
  topFinalScore?: number;
};

export type RecruiterAiSearchClickDetails = {
  searchId: string;
  candidateId: string;
  clickType: "VIEW_PROFILE" | "ADD_PIPELINE" | "SHORTLIST" | "RESULT_IMPRESSION";
  finalScore?: number;
  semanticScore?: number;
  rankPosition?: number;
};

export type RecruiterAiSearchShortlistDetails = {
  searchId: string;
  jobId: string;
  candidateId: string;
  applicationId?: string;
  finalScore?: number;
};

export type RecommendationActivityJobRef = {
  jobId: string;
  title?: string;
  matchScore?: number;
};

export type RecommendationActivityDetails = {
  candidateId: string;
  recommendedJobs: RecommendationActivityJobRef[];
  selectedJobs: RecommendationActivityJobRef[];
};

/** Audit payload for reverse (job→candidate) recommendation events. */
export type CandidateRecommendationActivityDetails = {
  jobId: string;
  candidateId: string;
  recommendationScore: number;
  /** Set when shortlist creates an application. */
  applicationId?: string;
};

export type CandidateScoredDetails = {
  jobId: string;
  candidateId: string;
  candidateFitScore: number;
};

export type HighMatchFoundDetails = {
  jobId: string;
  candidateId: string;
  candidateFitScore: number;
};

export function buildCandidateScoredDetails(input: {
  jobId: string;
  candidateId: string;
  candidateFitScore: number;
}): CandidateScoredDetails {
  return {
    jobId: input.jobId.trim(),
    candidateId: input.candidateId.trim(),
    candidateFitScore:
      Math.round(Math.min(100, Math.max(0, input.candidateFitScore)) * 10) / 10,
  };
}

export function buildHighMatchFoundDetails(input: {
  jobId: string;
  candidateId: string;
  candidateFitScore: number;
}): HighMatchFoundDetails {
  return {
    jobId: input.jobId.trim(),
    candidateId: input.candidateId.trim(),
    candidateFitScore:
      Math.round(Math.min(100, Math.max(0, input.candidateFitScore)) * 10) / 10,
  };
}

export function buildAiCandidateScoreInteractionDetails(input: {
  jobId: string;
  candidateId: string;
  interactionType: AiCandidateScoreInteractionDetails["interactionType"];
  candidateFitScore?: number;
  semanticScore?: number;
  rankPosition?: number;
  reason?: string;
}): AiCandidateScoreInteractionDetails {
  const details: AiCandidateScoreInteractionDetails = {
    jobId: input.jobId.trim(),
    candidateId: input.candidateId.trim(),
    interactionType: input.interactionType,
  };
  if (input.candidateFitScore != null && Number.isFinite(input.candidateFitScore)) {
    details.candidateFitScore =
      Math.round(Math.min(100, Math.max(0, input.candidateFitScore)) * 10) / 10;
  }
  if (input.semanticScore != null && Number.isFinite(input.semanticScore)) {
    details.semanticScore =
      Math.round(Math.min(100, Math.max(0, input.semanticScore)) * 10) / 10;
  }
  if (input.rankPosition != null && Number.isFinite(input.rankPosition)) {
    details.rankPosition = Math.max(0, Math.trunc(input.rankPosition));
  }
  if (typeof input.reason === "string" && input.reason.trim()) {
    details.reason = input.reason.trim().slice(0, 500);
  }
  return details;
}

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

export function buildInterviewRescheduledDetails(input: {
  interviewId: string;
  applicationId: string;
  fromScheduledAt: Date;
  toScheduledAt: Date;
  fromDurationMinutes: number;
  toDurationMinutes: number;
}): InterviewRescheduledDetails {
  return {
    interviewId: input.interviewId.trim(),
    applicationId: input.applicationId.trim(),
    interviewerId: null,
    fromScheduledAt: input.fromScheduledAt.toISOString(),
    toScheduledAt: input.toScheduledAt.toISOString(),
    fromDurationMinutes: Math.max(0, Math.trunc(input.fromDurationMinutes)),
    toDurationMinutes: Math.max(0, Math.trunc(input.toDurationMinutes)),
  };
}

export const MAX_INTERVIEW_CANCELLATION_REASON_LENGTH = 2_000;

export function buildInterviewCancelledDetails(input: {
  interviewId: string;
  applicationId: string;
  previousStatus: string;
  scheduledAt: Date;
  durationMinutes: number;
  reason: string;
}): InterviewCancelledDetails {
  return {
    interviewId: input.interviewId.trim(),
    applicationId: input.applicationId.trim(),
    interviewerId: null,
    previousStatus: input.previousStatus.trim(),
    scheduledAt: input.scheduledAt.toISOString(),
    durationMinutes: Math.max(0, Math.trunc(input.durationMinutes)),
    reason: input.reason.trim().slice(0, MAX_INTERVIEW_CANCELLATION_REASON_LENGTH),
  };
}

export function buildRecommendationActivityDetails(
  candidateId: string,
  recommendedJobs: RecommendationActivityJobRef[],
  selectedJobs: RecommendationActivityJobRef[]
): RecommendationActivityDetails {
  return {
    candidateId,
    recommendedJobs,
    selectedJobs,
  };
}

export function buildEmailActivityDetails(input: {
  recipient: string;
  emailType: string;
  applicationId?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  bullmqJobId?: string | null;
  error?: string | null;
  reminderLeadHours?: number | null;
}): EmailActivityDetails {
  const details: EmailActivityDetails = {
    recipient: input.recipient.trim().toLowerCase(),
    emailType: input.emailType.trim(),
  };
  const applicationId = input.applicationId?.trim();
  if (applicationId) details.applicationId = applicationId;
  const jobId = input.jobId?.trim();
  if (jobId) details.jobId = jobId;
  const jobTitle = input.jobTitle?.trim();
  if (jobTitle) details.jobTitle = jobTitle;
  const bullmqJobId = input.bullmqJobId?.trim();
  if (bullmqJobId) details.bullmqJobId = bullmqJobId;
  const error = input.error?.trim();
  if (error) details.error = error.length > 500 ? `${error.slice(0, 497)}...` : error;
  if (
    input.reminderLeadHours != null &&
    Number.isFinite(input.reminderLeadHours) &&
    input.reminderLeadHours > 0
  ) {
    details.reminderLeadHours = input.reminderLeadHours;
  }
  return details;
}

export function buildAiSearchPerformedDetails(input: {
  searchId: string;
  query: string;
  topResult: AiSearchTopResultRef | null;
  similarityScore: number;
  semanticScore?: number;
  resultCount: number;
  durationMs?: number;
  querySkillTokens?: readonly string[];
}): AiSearchPerformedDetails {
  const details: AiSearchPerformedDetails = {
    searchId: input.searchId.trim(),
    query: input.query.trim(),
    topResult: input.topResult,
    similarityScore: Math.round(Math.min(100, Math.max(0, input.similarityScore)) * 10) / 10,
    resultCount: Math.max(0, Math.trunc(input.resultCount)),
    success: input.resultCount > 0,
  };
  if (input.semanticScore != null && Number.isFinite(input.semanticScore)) {
    details.semanticScore =
      Math.round(Math.min(100, Math.max(0, input.semanticScore)) * 10) / 10;
  }
  if (input.durationMs != null && Number.isFinite(input.durationMs)) {
    details.durationMs = Math.trunc(input.durationMs);
  }
  if (input.querySkillTokens?.length) {
    details.querySkillTokens = [...input.querySkillTokens];
  }
  return details;
}

export function buildCandidateAiMatchedDetails(input: {
  searchId: string;
  query: string;
  candidateId: string;
  candidateName: string;
  similarityScore: number;
  semanticScore?: number;
  rankPosition: number;
}): CandidateAiMatchedDetails {
  const details: CandidateAiMatchedDetails = {
    searchId: input.searchId.trim(),
    query: input.query.trim(),
    candidateId: input.candidateId.trim(),
    candidateName: input.candidateName.trim() || "Candidate",
    similarityScore: Math.round(Math.min(100, Math.max(0, input.similarityScore)) * 10) / 10,
    rankPosition: Math.max(0, Math.trunc(input.rankPosition)),
  };
  if (input.semanticScore != null && Number.isFinite(input.semanticScore)) {
    details.semanticScore =
      Math.round(Math.min(100, Math.max(0, input.semanticScore)) * 10) / 10;
  }
  return details;
}

export function buildCandidateRecommendationActivityDetails(
  jobId: string,
  candidateId: string,
  recommendationScore: number,
  applicationId?: string
): CandidateRecommendationActivityDetails {
  const details: CandidateRecommendationActivityDetails = {
    jobId,
    candidateId,
    recommendationScore,
  };
  if (applicationId) {
    details.applicationId = applicationId;
  }
  return details;
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

