-- Add first-class skill arrays on candidates for recommendation matching.
ALTER TABLE "candidates"
ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "normalized_skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill raw skills from existing candidate_skills rows (one row per skill).
UPDATE "candidates" AS c
SET "skills" = agg.skills
FROM (
  SELECT
    "candidate_id",
    ARRAY_AGG("skill_name" ORDER BY "created_at", "id") AS skills
  FROM "candidate_skills"
  GROUP BY "candidate_id"
) AS agg
WHERE c."id" = agg."candidate_id";

-- normalized_skills: left empty for existing rows; populated on next parse-apply via app
-- (uses normalizeSkill in src/lib/resume-job-match.ts — not reproducible in SQL alone).
