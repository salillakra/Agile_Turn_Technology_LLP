/**
 * Client-side validation for New Position modal — mirrors POST /api/jobs + recommendation requirements.
 */

export type NewJobFormShape = {
  title?: string;
  dept?: string;
  loc?: string;
  employmentType?: string;
  openings?: number;
  roleSummary?: string;
  keyResponsibilities?: string;
  requiredSkills?: string;
  experienceRequired?: string;
  minimumExperienceYears?: string | number;
};

export function splitCsvSkills(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Returns first validation error message, or null if the form can be submitted. */
export function validateNewJobForm(form: NewJobFormShape): string | null {
  if (!form.title?.trim()) return "Job title is required.";
  if (!form.dept?.trim()) return "Department is required.";
  if (!form.loc?.trim()) return "Location is required.";
  if (!form.employmentType?.trim()) return "Employment type is required.";
  if (!Number.isInteger(form.openings) || Number(form.openings) < 1) {
    return "Openings must be at least 1.";
  }
  if (!form.roleSummary?.trim()) {
    return "Role summary is required for semantic job matching.";
  }
  if (!form.keyResponsibilities?.trim()) return "Key responsibilities are required.";
  if (!form.experienceRequired?.trim()) return "Experience required (label) is required.";
  const requiredSkills = splitCsvSkills(form.requiredSkills);
  if (requiredSkills.length === 0) {
    return "Add at least one required skill (comma-separated) for recommendations.";
  }
  const minYearsRaw = form.minimumExperienceYears;
  if (minYearsRaw === "" || minYearsRaw === null || minYearsRaw === undefined) {
    return "Minimum experience (years) is required — use 0 for entry-level roles.";
  }
  const minYears = Number(minYearsRaw);
  if (!Number.isFinite(minYears) || !Number.isInteger(minYears) || minYears < 0) {
    return "Minimum experience (years) must be a whole number ≥ 0.";
  }
  return null;
}
