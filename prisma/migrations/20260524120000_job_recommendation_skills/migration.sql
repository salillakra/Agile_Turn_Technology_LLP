-- Add first-class skill arrays on jobs for recommendation matching.
ALTER TABLE "jobs"
ADD COLUMN "required_skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "preferred_skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill from existing job_meta JSON (non-destructive; job_meta unchanged).
UPDATE "jobs"
SET "required_skills" = COALESCE(
  (
    SELECT ARRAY_AGG(elem ORDER BY ord)
    FROM jsonb_array_elements_text("job_meta"->'requiredSkills') WITH ORDINALITY AS t(elem, ord)
  ),
  ARRAY[]::TEXT[]
)
WHERE "job_meta" IS NOT NULL
  AND jsonb_typeof("job_meta"->'requiredSkills') = 'array'
  AND jsonb_array_length("job_meta"->'requiredSkills') > 0;

UPDATE "jobs"
SET "preferred_skills" = COALESCE(
  (
    SELECT ARRAY_AGG(elem ORDER BY ord)
    FROM jsonb_array_elements_text("job_meta"->'preferredSkills') WITH ORDINALITY AS t(elem, ord)
  ),
  ARRAY[]::TEXT[]
)
WHERE "job_meta" IS NOT NULL
  AND jsonb_typeof("job_meta"->'preferredSkills') = 'array'
  AND jsonb_array_length("job_meta"->'preferredSkills') > 0;
