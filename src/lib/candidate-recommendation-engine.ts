/**
 * Reverse recommendation engine: rank candidates for a single job.
 *
 * Uses **precomputed** embeddings only (`Job.embedding`, `Candidate.embedding` JSON).
 * Does not call the AI `/embed` service or `embedText()` — vectors must be synced earlier
 * via `job-embedding-sync` / `candidate-embedding-sync` on create/update/parse apply.
 *
 * Compares one job profile (skills, experience, stored embedding) against many candidates,
 * reusing the same hybrid scorer as forward recommendations (`hybrid-recommendation.ts`).
 */

import { computeCandidateExperienceCompatibility } from "@/src/lib/ai/candidate-experience-compatibility";
import {
  buildCandidateRecommendationReasons,
  buildPrimaryRecommendationReason,
} from "@/src/lib/ai/candidate-recommendation-reasons";
import { collectCandidateFitSignals } from "@/src/lib/ai/candidate-scoring-signals";
import { computeCandidateSkillOverlap } from "@/src/lib/ai/candidate-skill-overlap";
import {
  computeHybridFinalScore,
  computeLocationScorePercent,
  HYBRID_RECOMMENDATION_WEIGHTS,
  type HybridRecommendationJobInput,
} from "@/src/lib/hybrid-recommendation";

/** Re-export for API/docs: 50% semantic, 30% skill, 15% experience, 5% location. */
export { HYBRID_RECOMMENDATION_WEIGHTS };
import {
  filterCandidateRecommendationsByThreshold,
  getDefaultCandidateRecommendationMinScorePercent,
} from "@/src/lib/recommendation-config";
import type { RecommendationCandidateInput } from "@/src/lib/recommendation-engine";
import {
  buildExperienceMatchText,
  buildHybridRecommendationReason,
  resolveSkillExplainability,
} from "@/src/lib/recommendation-explainability";
import { rankCandidatesBySemanticSimilarity } from "@/src/lib/semantic-recommendation";
import { cosineSimilarity, extractEmbeddingVector } from "@/src/lib/vector-similarity";

/** Recruiter-facing row for `GET /api/jobs/[id]/recommended-candidates`. */
export type RecommendedCandidateApiRow = {
  candidateId: string;
  candidateName: string;
  finalScore: number;
  /** 0–100 when job and candidate embeddings exist; omitted from UI when unavailable. */
  semanticScore: number;
  /** False when vectors are missing — UI should not show "Semantic 0%". */
  semanticAvailable: boolean;
  matchedSkills: string[];
  recommendationReason: string;
  recommendationReasons: string[];
};

/** Job + embedding passed into the reverse engine (same shape as forward job input). */
export type CandidateRecommendationJobInput = HybridRecommendationJobInput;

/** One candidate row in the matching pool. */
export type CandidateRecommendationPoolItem = RecommendationCandidateInput & {
  id: string;
  candidateName: string;
  email?: string;
  embedding?: unknown | null;
};

export {
  candidateIdentityKey,
  normalizeCandidateEmail,
  normalizeCandidateName,
  recommendationIdentityKey,
} from "@/src/lib/candidate-identity";
import {
  candidateIdentityKey,
  normalizeCandidateEmail,
  normalizeCandidateName,
} from "@/src/lib/candidate-identity";

/** @deprecated Pre-score pool dedupe dropped better-scoring duplicates; use post-score identity dedupe. */
export function dedupeCandidatePoolByEmail(
  pool: readonly CandidateRecommendationPoolItem[]
): CandidateRecommendationPoolItem[] {
  return [...pool];
}

/**
 * After scoring + threshold: one row per person, keeping the highest `finalScore`.
 */
export function dedupeCandidateRecommendationsByIdentity(
  rows: readonly CandidateRecommendationRow[],
  pool: readonly { id: string; email?: string; candidateName?: string }[]
): CandidateRecommendationRow[] {
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const best = new Map<string, CandidateRecommendationRow>();
  for (const row of rows) {
    const poolItem = poolById.get(row.candidateId);
    const key = candidateIdentityKey({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      email: poolItem?.email,
    });
    const prev = best.get(key);
    if (!prev || compareCandidateRecommendations(row, prev) < 0) {
      best.set(key, row);
    }
  }
  const deduped = [...best.values()];
  deduped.sort(compareCandidateRecommendations);
  return deduped;
}

/** @deprecated Use {@link dedupeCandidateRecommendationsByIdentity}. */
export function dedupeCandidateRecommendationsByEmail(
  rows: readonly CandidateRecommendationRow[],
  pool: readonly { id: string; email?: string; candidateName?: string }[]
): CandidateRecommendationRow[] {
  return dedupeCandidateRecommendationsByIdentity(rows, pool);
}

/**
 * Hybrid blend components (each 0–100) and weighted `finalScore`.
 *
 * `finalScore` =
 *   {@link HYBRID_RECOMMENDATION_WEIGHTS.semantic} × semanticScore +
 *   {@link HYBRID_RECOMMENDATION_WEIGHTS.skill} × skillScore +
 *   {@link HYBRID_RECOMMENDATION_WEIGHTS.experience} × experienceScore +
 *   {@link HYBRID_RECOMMENDATION_WEIGHTS.location} × locationScore
 */
export type JobCandidateHybridScore = {
  finalScore: number;
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  /** Used in blend only; omitted from default API row unless extended. */
  locationScore: number;
};

/** Ranked output row for APIs and UI. */
export type CandidateRecommendationRow = {
  candidateId: string;
  candidateName: string;
  finalScore: number;
  semanticScore: number;
  skillScore: number;
  /** Job required labels matched via `candidate.normalizedSkills`. */
  matchedSkills: string[];
  /** Required job skills absent from candidate profile. */
  missingSkills: string[];
  /** 0–100 experience component (`totalExperience` vs `yearsOfExperience`). */
  experienceScore: number;
  /** `candidate.totalExperience − job.yearsOfExperience` (years), or null if unknown. */
  experienceGapYears: number | null;
  /** True when candidate meets or exceeds the job minimum years. */
  meetsExperienceMinimum: boolean;
  /** Recruiter-facing explanation (semantic, skills, experience, gaps). */
  recommendationReason: string;
  recommendationReasons: string[];
};

/** Experience fit: `candidate.totalExperience` vs `job.yearsOfExperience`. */
export type JobCandidateExperienceCompatibility = {
  jobYearsOfExperience: number | null;
  candidateTotalExperience: number | null;
  experienceGapYears: number | null;
  meetsExperienceMinimum: boolean;
  /** 0–100 input to hybrid blend. */
  experienceScore: number;
};

/** Required-skill overlap: `job.requiredSkills` vs `candidate.normalizedSkills`. */
export type JobCandidateSkillOverlap = {
  matchedSkills: string[];
  missingSkills: string[];
  /** Matched required / total required (0–100). Zero when job has no required skills. */
  requiredMatchPercent: number;
  /** 0–100 input to hybrid blend; higher when overlap is higher. */
  skillScore: number;
};

/** Result of job↔candidate cosine match on stored embeddings. */
export type JobCandidateSemanticMatch = {
  semanticScore: number;
  /** Raw cosine in [0, 1], or null when vectors unavailable. */
  cosineSimilarity: number | null;
  hasJobEmbedding: boolean;
  hasCandidateEmbedding: boolean;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Balanced experience score for reverse recommendations
 * (delegates to {@link computeCandidateExperienceCompatibility}).
 */
export function computeJobCandidateExperienceCompatibility(
  job: CandidateRecommendationJobInput,
  candidate: RecommendationCandidateInput
): JobCandidateExperienceCompatibility {
  const result = computeCandidateExperienceCompatibility(job, candidate);
  return {
    jobYearsOfExperience: result.jobYearsOfExperience,
    candidateTotalExperience: result.candidateTotalExperience,
    experienceGapYears: result.experienceGapYears,
    meetsExperienceMinimum: result.meetsExperienceMinimum,
    experienceScore: result.experienceScore,
  };
}

/** True when a persisted `{ vector: number[] }` embedding is present (no generation). */
export function hasStoredEmbedding(stored: unknown): boolean {
  return extractEmbeddingVector(stored) != null;
}

/**
 * Read embedding payload from DB JSON only (identity helper for call sites).
 * Never invokes the AI service.
 */
export function readStoredEmbedding(stored: unknown): unknown {
  return stored ?? null;
}

/**
 * Semantic similarity for reverse recommendations (stored embeddings only).
 *
 * 1. Load vectors from `Job.embedding` and `Candidate.embedding`.
 * 2. Compute cosine similarity.
 * 3. Return `semanticScore` (0–100).
 */
export function computeJobCandidateSemanticSimilarity(
  jobEmbedding: unknown,
  candidateEmbedding: unknown
): JobCandidateSemanticMatch {
  const jobVector = extractEmbeddingVector(readStoredEmbedding(jobEmbedding));
  const candidateVector = extractEmbeddingVector(readStoredEmbedding(candidateEmbedding));

  if (!jobVector || !candidateVector) {
    return {
      semanticScore: 0,
      cosineSimilarity: null,
      hasJobEmbedding: jobVector != null,
      hasCandidateEmbedding: candidateVector != null,
    };
  }

  try {
    const cosine = cosineSimilarity(jobVector, candidateVector);
    return {
      semanticScore: roundScore(cosine * 100),
      cosineSimilarity: cosine,
      hasJobEmbedding: true,
      hasCandidateEmbedding: true,
    };
  } catch {
    return {
      semanticScore: 0,
      cosineSimilarity: null,
      hasJobEmbedding: true,
      hasCandidateEmbedding: true,
    };
  }
}

/** @deprecated Use `computeJobCandidateSemanticSimilarity` */
export function computeCandidateSemanticScore(
  jobEmbedding: unknown,
  candidateEmbedding: unknown
): number {
  return computeJobCandidateSemanticSimilarity(jobEmbedding, candidateEmbedding).semanticScore;
}

/**
 * Skill overlap for job↔candidate ranking (delegates to {@link computeCandidateSkillOverlap}).
 */
export function computeJobCandidateSkillOverlap(
  job: CandidateRecommendationJobInput,
  candidate: RecommendationCandidateInput
): JobCandidateSkillOverlap {
  const overlap = computeCandidateSkillOverlap(job, candidate);
  return {
    matchedSkills: overlap.matchedSkills,
    missingSkills: overlap.missingSkills,
    requiredMatchPercent: overlap.requiredMatchPercent,
    skillScore: overlap.skillScore,
  };
}

/**
 * Rank candidates by `semanticScore` only (cosine on stored embeddings), best first.
 */
export function recommendCandidatesBySemanticSimilarity(
  jobEmbedding: unknown,
  candidates: readonly CandidateRecommendationPoolItem[]
): Array<{ candidateId: string; candidateName: string; semanticScore: number }> {
  return rankCandidatesBySemanticSimilarity(
    jobEmbedding,
    candidates.map((c) => ({
      candidateId: c.id,
      candidateName: c.candidateName,
      embedding: c.embedding,
    }))
  );
}

/**
 * Compute hybrid candidate recommendation scores for one job↔candidate pair.
 *
 * | Signal     | Weight | Source |
 * |------------|--------|--------|
 * | Semantic   | 50%    | Cosine on stored `Job.embedding` × `Candidate.embedding` |
 * | Skill      | 30%    | `job.requiredSkills` vs `candidate.normalizedSkills` |
 * | Experience | 15%    | `candidate.totalExperience` vs `job.yearsOfExperience` |
 * | Location   | 5%     | `candidate.preferredWorkLocation` vs `job.location` |
 */
export function computeJobCandidateHybridScore(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidate: RecommendationCandidateInput,
  candidateEmbedding?: unknown | null
): JobCandidateHybridScore {
  const storedJobEmbedding = readStoredEmbedding(jobEmbedding);
  const storedCandidateEmbedding = readStoredEmbedding(candidateEmbedding ?? null);

  const semantic = computeJobCandidateSemanticSimilarity(
    storedJobEmbedding,
    storedCandidateEmbedding
  );
  const skills = computeJobCandidateSkillOverlap(job, candidate);
  const experience = computeJobCandidateExperienceCompatibility(job, candidate);
  const locationScore = computeLocationScorePercent(candidate, job);

  const hasSemanticSignal =
    semantic.hasJobEmbedding &&
    semantic.hasCandidateEmbedding &&
    semantic.cosineSimilarity != null;

  const finalScore = computeHybridFinalScore(
    {
      semanticScore: semantic.semanticScore,
      skillScore: skills.skillScore,
      experienceScore: experience.experienceScore,
      locationScore,
    },
    { hasSemanticSignal }
  );

  return {
    finalScore,
    semanticScore: semantic.semanticScore,
    skillScore: skills.skillScore,
    experienceScore: experience.experienceScore,
    locationScore,
  };
}

/**
 * Full ranked row: hybrid scores plus skill/experience explainability fields.
 */
export function scoreCandidateForJob(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidate: CandidateRecommendationPoolItem
): CandidateRecommendationRow {
  const hybrid = computeJobCandidateHybridScore(
    job,
    jobEmbedding,
    candidate,
    candidate.embedding
  );
  const skills = computeJobCandidateSkillOverlap(job, candidate);
  const experience = computeJobCandidateExperienceCompatibility(job, candidate);
  const signals = collectCandidateFitSignals({
    job,
    candidate,
    jobEmbedding,
    candidateEmbedding: candidate.embedding,
  });

  const reasonInput = {
    job,
    candidate,
    signals,
    semanticScore: hybrid.semanticScore,
    skillScore: hybrid.skillScore,
    experienceScore: hybrid.experienceScore,
  };
  const recommendationReasons = buildCandidateRecommendationReasons(reasonInput);
  const recommendationReason = buildPrimaryRecommendationReason(reasonInput);

  return {
    candidateId: candidate.id,
    candidateName: candidate.candidateName.trim() || "Candidate",
    finalScore: hybrid.finalScore,
    semanticScore: hybrid.semanticScore,
    skillScore: hybrid.skillScore,
    experienceScore: hybrid.experienceScore,
    matchedSkills: skills.matchedSkills,
    missingSkills: skills.missingSkills,
    experienceGapYears: experience.experienceGapYears,
    meetsExperienceMinimum: experience.meetsExperienceMinimum,
    recommendationReason,
    recommendationReasons,
  };
}

/** Sort candidates best-first: finalScore DESC, then semanticScore DESC, then id ASC. */
export function compareCandidateRecommendations(
  a: CandidateRecommendationRow,
  b: CandidateRecommendationRow
): number {
  if (b.finalScore !== a.finalScore) {
    return b.finalScore - a.finalScore;
  }
  if (b.semanticScore !== a.semanticScore) {
    return b.semanticScore - a.semanticScore;
  }
  if (b.skillScore !== a.skillScore) {
    return b.skillScore - a.skillScore;
  }
  if (b.matchedSkills.length !== a.matchedSkills.length) {
    return b.matchedSkills.length - a.matchedSkills.length;
  }
  if (b.experienceScore !== a.experienceScore) {
    return b.experienceScore - a.experienceScore;
  }
  return a.candidateId.localeCompare(b.candidateId);
}

/**
 * Compare a job against all candidates using stored embeddings only, rank DESC.
 *
 * @param jobEmbedding — typically `job.embedding` from Prisma (precomputed).
 */
export function recommendCandidatesForJob(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidates: readonly CandidateRecommendationPoolItem[]
): CandidateRecommendationRow[] {
  const storedJobEmbedding = readStoredEmbedding(jobEmbedding);
  const scored = (candidates ?? []).map((candidate) =>
    scoreCandidateForJob(job, storedJobEmbedding, candidate)
  );
  scored.sort(compareCandidateRecommendations);
  return scored;
}

/**
 * Convenience: pass job row with `embedding` set; reads cached vectors only.
 */
export function recommendCandidatesWithStoredEmbeddings(
  job: CandidateRecommendationJobInput,
  candidates: readonly CandidateRecommendationPoolItem[]
): CandidateRecommendationRow[] {
  return recommendCandidatesForJob(job, job.embedding ?? null, candidates);
}

/**
 * Rank and threshold in one call (common API path).
 * Candidates below `minFinalScore` are omitted (default 45%, configurable).
 */
export function recommendAndFilterCandidatesForJob(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidates: readonly CandidateRecommendationPoolItem[],
  minFinalScore: number = getDefaultCandidateRecommendationMinScorePercent()
): CandidateRecommendationRow[] {
  return filterCandidateRecommendationsByThreshold(
    recommendCandidatesForJob(job, jobEmbedding, candidates),
    minFinalScore
  );
}

/**
 * Template-based recruiter explanation for a job→candidate recommendation (no LLM).
 */
export function buildJobCandidateRecommendationReason(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidate: RecommendationCandidateInput,
  candidateEmbedding: unknown | null,
  semanticScore: number,
  skillScore: number,
  matchedSkills: readonly string[],
  matchedPreferredSkills: readonly string[],
  missingSkills: readonly string[]
): string {
  return buildHybridRecommendationReason({
    jobTitle: job.title,
    semanticScore,
    skillScore,
    matchedSkills,
    matchedPreferredSkills,
    missingSkills,
    hasEmbeddings:
      hasStoredEmbedding(jobEmbedding) && hasStoredEmbedding(candidateEmbedding),
    experienceMatch: buildExperienceMatchText(candidate, job),
  });
}

/** Map engine row to the public recommended-candidates API shape. */
export function toRecommendedCandidateApiRow(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidate: RecommendationCandidateInput,
  candidateEmbedding: unknown | null,
  row: CandidateRecommendationRow
): RecommendedCandidateApiRow {
  const semanticAvailable =
    hasStoredEmbedding(jobEmbedding) && hasStoredEmbedding(candidateEmbedding);
  return {
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    finalScore: row.finalScore,
    semanticScore: row.semanticScore,
    semanticAvailable,
    matchedSkills: row.matchedSkills,
    recommendationReason: row.recommendationReason,
    recommendationReasons: row.recommendationReasons,
  };
}

/**
 * Rank, threshold-filter, and shape rows for `GET /api/jobs/[id]/recommended-candidates`.
 */
export function recommendCandidatesForJobApi(
  job: CandidateRecommendationJobInput,
  jobEmbedding: unknown,
  candidates: readonly CandidateRecommendationPoolItem[],
  minFinalScore: number = getDefaultCandidateRecommendationMinScorePercent()
): RecommendedCandidateApiRow[] {
  const jobInput = job;
  const storedEmbedding = readStoredEmbedding(jobEmbedding);

  const filtered = recommendAndFilterCandidatesForJob(
    jobInput,
    storedEmbedding,
    candidates,
    minFinalScore
  );
  const dedupedRows = dedupeCandidateRecommendationsByIdentity(filtered, candidates);

  return dedupedRows.map((row) => {
    const poolItem = candidates.find((c) => c.id === row.candidateId);
    return toRecommendedCandidateApiRow(
      jobInput,
      storedEmbedding,
      poolItem ?? { skills: [], normalizedSkills: [] },
      poolItem?.embedding ?? null,
      row
    );
  });
}
