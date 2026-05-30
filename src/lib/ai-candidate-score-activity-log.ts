import {
  ACTIVITY_ACTION_AI_CANDIDATE_SCORE_INTERACTION,
  ACTIVITY_ACTION_CANDIDATE_SCORED,
  ACTIVITY_ACTION_CANDIDATE_SHORTLISTED,
  ACTIVITY_ACTION_HIGH_MATCH_FOUND,
  buildAiCandidateScoreInteractionDetails,
  buildCandidateRecommendationActivityDetails,
  buildCandidateScoredDetails,
  buildHighMatchFoundDetails,
  serializeActivityLogDetails,
  type AiCandidateScoreInteractionDetails,
} from "@/src/lib/activity-log-details";
import { prisma } from "@/src/lib/prisma";
import { isValidCuid } from "@/src/lib/validate-id";

export async function logAiCandidateScoreInteraction(params: {
  jobId: string;
  candidateId: string;
  userId: string | undefined;
  interactionType: AiCandidateScoreInteractionDetails["interactionType"];
  candidateFitScore?: number;
  semanticScore?: number;
  rankPosition?: number;
  reason?: string;
}): Promise<void> {
  const jobId = params.jobId.trim();
  const candidateId = params.candidateId.trim();
  if (!isValidCuid(jobId) || !isValidCuid(candidateId)) return;

  const detailsObj = buildAiCandidateScoreInteractionDetails({
    jobId,
    candidateId,
    interactionType: params.interactionType,
    candidateFitScore: params.candidateFitScore,
    semanticScore: params.semanticScore,
    rankPosition: params.rankPosition,
    reason: params.reason,
  });

  const serialized = serializeActivityLogDetails(detailsObj);
  if (!serialized.ok) return;

  await prisma.activityLog.create({
    data: {
      userId: params.userId ?? null,
      candidateId,
      action: ACTIVITY_ACTION_AI_CANDIDATE_SCORE_INTERACTION,
      details: serialized.json,
    },
  });
}

export async function logCandidateScored(params: {
  jobId: string;
  candidateId: string;
  userId: string | undefined;
  candidateFitScore: number;
}): Promise<void> {
  const jobId = params.jobId.trim();
  const candidateId = params.candidateId.trim();
  if (!isValidCuid(jobId) || !isValidCuid(candidateId)) return;

  const detailsObj = buildCandidateScoredDetails({
    jobId,
    candidateId,
    candidateFitScore: params.candidateFitScore,
  });

  const serialized = serializeActivityLogDetails(detailsObj);
  if (!serialized.ok) return;

  await prisma.activityLog.create({
    data: {
      userId: params.userId ?? null,
      candidateId,
      action: ACTIVITY_ACTION_CANDIDATE_SCORED,
      details: serialized.json,
    },
  });
}

export async function logHighMatchFound(params: {
  jobId: string;
  candidateId: string;
  userId: string | undefined;
  candidateFitScore: number;
}): Promise<void> {
  const jobId = params.jobId.trim();
  const candidateId = params.candidateId.trim();
  if (!isValidCuid(jobId) || !isValidCuid(candidateId)) return;

  const detailsObj = buildHighMatchFoundDetails({
    jobId,
    candidateId,
    candidateFitScore: params.candidateFitScore,
  });

  const serialized = serializeActivityLogDetails(detailsObj);
  if (!serialized.ok) return;

  await prisma.activityLog.create({
    data: {
      userId: params.userId ?? null,
      candidateId,
      action: ACTIVITY_ACTION_HIGH_MATCH_FOUND,
      details: serialized.json,
    },
  });
}

/**
 * Dedicated shortlist audit action for AI candidate scoring flows.
 * (This is separate from pipeline/application writes.)
 */
export async function logAiCandidateScoreShortlisted(params: {
  jobId: string;
  candidateId: string;
  userId: string | undefined;
  candidateFitScore: number;
  applicationId?: string;
}): Promise<void> {
  const jobId = params.jobId.trim();
  const candidateId = params.candidateId.trim();
  if (!isValidCuid(jobId) || !isValidCuid(candidateId)) return;

  const detailsObj = buildCandidateRecommendationActivityDetails(
    jobId,
    candidateId,
    params.candidateFitScore,
    params.applicationId
  );

  const serialized = serializeActivityLogDetails(detailsObj);
  if (!serialized.ok) return;

  await prisma.activityLog.create({
    data: {
      userId: params.userId ?? null,
      candidateId,
      applicationId: params.applicationId ?? null,
      action: ACTIVITY_ACTION_CANDIDATE_SHORTLISTED,
      details: serialized.json,
    },
  });
}

