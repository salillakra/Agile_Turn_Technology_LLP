/** Max lengths for job fields. Used by POST and PUT /api/jobs. */
export const JOB_FIELD_LIMITS = {
  title: 100,
  department: 50,
  location: 100,
  description: 2000,
  roleSummary: 1000,
  keyResponsibilities: 3000,
  experienceRequired: 100,
  education: 200,
  locationConstraints: 300,
  tagsItem: 40,
  skillsItem: 80,
} as const;

type JobFields = {
  title?: string | null;
  department?: string | null;
  location?: string | null;
  description?: string | null;
};

/** Validates job field lengths. Returns first error message or null. */
export function validateJobFields(fields: JobFields): { error: string } | null {
  if (fields.title != null && fields.title.length > JOB_FIELD_LIMITS.title) {
    return { error: `title must be at most ${JOB_FIELD_LIMITS.title} characters` };
  }
  if (fields.department != null && fields.department.length > JOB_FIELD_LIMITS.department) {
    return { error: `department must be at most ${JOB_FIELD_LIMITS.department} characters` };
  }
  if (fields.location != null && fields.location.length > JOB_FIELD_LIMITS.location) {
    return { error: `location must be at most ${JOB_FIELD_LIMITS.location} characters` };
  }
  if (fields.description != null && fields.description.length > JOB_FIELD_LIMITS.description) {
    return { error: `description must be at most ${JOB_FIELD_LIMITS.description} characters` };
  }
  return null;
}

type JobMetaInput = {
  employmentType?: string;
  numberOfOpenings?: number;
  roleSummary?: string;
  keyResponsibilities?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  experienceRequired?: string;
  pipelineStages?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  budgetApprovalStatus?: string | null;
  education?: string | null;
  minimumExperienceYears?: number | null;
  locationConstraints?: string | null;
  applicationDeadline?: string | null;
  allowReferrals?: boolean;
  tags?: string[];
  /** If set (0–100), resume skill-match must be >= threshold to create an application. */
  resumeMatchThreshold?: number | null;
};

/**
 * Fields required for hybrid recommendations, embeddings, and skill matching.
 * Enforced on POST /api/jobs (create only).
 */
export const JOB_CREATE_RECOMMENDATION_REQUIRED = [
  "title",
  "department",
  "location",
  "roleSummary",
  "keyResponsibilities",
  "requiredSkills",
  "experienceRequired",
  "minimumExperienceYears",
  "employmentType",
] as const;

export function validateJobMetaForCreate(meta: JobMetaInput): { error: string } | null {
  if (!meta.employmentType) return { error: "employmentType is required" };
  if (!["FULL_TIME", "INTERNSHIP", "CONTRACT"].includes(meta.employmentType)) {
    return { error: "employmentType must be one of: FULL_TIME, INTERNSHIP, CONTRACT" };
  }
  if (!Number.isInteger(meta.numberOfOpenings) || Number(meta.numberOfOpenings) < 1) {
    return { error: "numberOfOpenings must be an integer >= 1" };
  }
  if (!meta.roleSummary?.trim()) {
    return { error: "roleSummary is required (used for semantic job matching)" };
  }
  if (!meta.keyResponsibilities?.trim()) {
    return { error: "keyResponsibilities is required" };
  }
  if (!meta.experienceRequired?.trim()) {
    return { error: "experienceRequired is required" };
  }
  if (!Array.isArray(meta.requiredSkills) || meta.requiredSkills.length === 0) {
    return {
      error:
        "requiredSkills must include at least one skill (comma-separated) for candidate recommendations",
    };
  }
  if (meta.minimumExperienceYears == null || !Number.isFinite(meta.minimumExperienceYears)) {
    return {
      error:
        "minimumExperienceYears is required (use 0 for entry-level / no minimum years) for experience scoring",
    };
  }
  if (!Number.isInteger(meta.minimumExperienceYears) || meta.minimumExperienceYears < 0) {
    return { error: "minimumExperienceYears must be an integer >= 0" };
  }
  return validateJobMetaCommon(meta);
}

/** Validates top-level job fields + meta for POST /api/jobs. */
export function validateJobCreatePayload(params: {
  title: string;
  department: string;
  location: string;
  jobMeta: JobMetaInput;
}): { error: string } | null {
  if (!params.title.trim()) return { error: "title is required" };
  if (!params.department.trim()) return { error: "department is required" };
  if (!params.location.trim()) return { error: "location is required" };

  const fieldErr = validateJobFields({
    title: params.title,
    department: params.department,
    location: params.location,
    description: params.jobMeta.roleSummary ?? null,
  });
  if (fieldErr) return fieldErr;

  return validateJobMetaForCreate(params.jobMeta);
}

export function validateJobMetaCommon(meta: JobMetaInput): { error: string } | null {
  if (meta.roleSummary && meta.roleSummary.length > JOB_FIELD_LIMITS.roleSummary) {
    return { error: `roleSummary must be at most ${JOB_FIELD_LIMITS.roleSummary} characters` };
  }
  if (meta.keyResponsibilities && meta.keyResponsibilities.length > JOB_FIELD_LIMITS.keyResponsibilities) {
    return { error: `keyResponsibilities must be at most ${JOB_FIELD_LIMITS.keyResponsibilities} characters` };
  }
  if (meta.experienceRequired && meta.experienceRequired.length > JOB_FIELD_LIMITS.experienceRequired) {
    return { error: `experienceRequired must be at most ${JOB_FIELD_LIMITS.experienceRequired} characters` };
  }
  if (meta.education && meta.education.length > JOB_FIELD_LIMITS.education) {
    return { error: `education must be at most ${JOB_FIELD_LIMITS.education} characters` };
  }
  if (meta.locationConstraints && meta.locationConstraints.length > JOB_FIELD_LIMITS.locationConstraints) {
    return { error: `locationConstraints must be at most ${JOB_FIELD_LIMITS.locationConstraints} characters` };
  }
  for (const item of meta.tags ?? []) {
    if (item.length > JOB_FIELD_LIMITS.tagsItem) {
      return { error: `each tag must be at most ${JOB_FIELD_LIMITS.tagsItem} characters` };
    }
  }
  for (const item of [...(meta.requiredSkills ?? []), ...(meta.preferredSkills ?? [])]) {
    if (item.length > JOB_FIELD_LIMITS.skillsItem) {
      return { error: `each skill must be at most ${JOB_FIELD_LIMITS.skillsItem} characters` };
    }
  }
  if (meta.salaryMin != null && !Number.isFinite(meta.salaryMin)) {
    return { error: "salaryMin must be a number" };
  }
  if (meta.salaryMax != null && !Number.isFinite(meta.salaryMax)) {
    return { error: "salaryMax must be a number" };
  }
  if (meta.salaryMin != null && meta.salaryMax != null && meta.salaryMin > meta.salaryMax) {
    return { error: "salaryMin cannot be greater than salaryMax" };
  }
  if (meta.minimumExperienceYears != null && (!Number.isFinite(meta.minimumExperienceYears) || meta.minimumExperienceYears < 0)) {
    return { error: "minimumExperienceYears must be >= 0" };
  }
  if (meta.resumeMatchThreshold != null) {
    if (!Number.isFinite(meta.resumeMatchThreshold)) {
      return { error: "resumeMatchThreshold must be a number" };
    }
    const t = meta.resumeMatchThreshold;
    if (t < 0 || t > 100) {
      return { error: "resumeMatchThreshold must be between 0 and 100" };
    }
  }
  return null;
}
