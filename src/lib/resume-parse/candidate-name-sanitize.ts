/**
 * Reject resume section headers and other non-person strings mis-parsed as names.
 */

const RESUME_SECTION_NAME_BLOCKLIST = new Set(
  [
    "about me",
    "about",
    "summary",
    "professional summary",
    "profile",
    "professional profile",
    "objective",
    "career objective",
    "contact",
    "contact information",
    "personal details",
    "personal information",
    "skills",
    "technical skills",
    "core competencies",
    "experience",
    "work experience",
    "professional experience",
    "employment history",
    "education",
    "academic background",
    "certifications",
    "certificates",
    "projects",
    "achievements",
    "awards",
    "references",
    "hobbies",
    "interests",
    "languages",
    "resume",
    "curriculum vitae",
    "cv",
    "unknown",
  ].map((s) => s.toLowerCase())
);

const SECTION_NAME_PATTERN =
  /^(about(\s+me)?|summary|profile|objective|contact(\s+info(rmation)?)?|personal(\s+(details|information))?|skills?|experience|education|certifications?|projects?|references?|resume|curriculum vitae|cv)\b/i;

export function isResumeSectionHeaderName(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (RESUME_SECTION_NAME_BLOCKLIST.has(normalized)) return true;
  return SECTION_NAME_PATTERN.test(value.trim());
}

export function isPlausiblePersonName(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const name = value.trim();
  if (name.length < 2 || name.length > 100) return false;
  if (isResumeSectionHeaderName(name)) return false;
  if (/@/.test(name) || /https?:\/\//i.test(name) || /www\./i.test(name)) return false;
  if (/\d{5,}/.test(name)) return false;
  if (!/[a-zA-Z]/.test(name)) return false;
  // Reject lines that look like job titles / headers (many commas or pipes)
  if ((name.match(/[|,]/g) ?? []).length >= 2) return false;
  return true;
}

/**
 * Pick the best candidate display name from parse outputs and known fallbacks.
 * Prefers plausible person names; never returns section headers like "About Me".
 */
export function resolveParsedCandidateName(params: {
  llmName?: string | null;
  ruleName?: string | null;
  fallbackName?: string | null;
  existingName?: string | null;
}): string {
  const candidates = [
    params.llmName,
    params.ruleName,
    params.fallbackName,
    params.existingName,
  ];

  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (trimmed && isPlausiblePersonName(trimmed)) {
      return trimmed;
    }
  }

  const lastResort = params.existingName?.trim() || params.fallbackName?.trim();
  if (lastResort && !isResumeSectionHeaderName(lastResort)) {
    return lastResort;
  }

  return "Unknown";
}

export function sanitizeParsedName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !isPlausiblePersonName(trimmed)) return null;
  return trimmed;
}
