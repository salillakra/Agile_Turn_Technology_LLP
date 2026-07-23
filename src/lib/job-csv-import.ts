/** CSV bulk import for jobs — column mapping, parsing, and template. */

import { JOB_FIELD_LIMITS } from "@/src/lib/job-validation";
import { extractKnownSkillsFromText } from "@/src/lib/skill-normalizer";

export const JOB_CSV_MAX_ROWS = 100;

export const JOB_CSV_TEMPLATE = `title,department,location,employmentType,openings,roleSummary,keyResponsibilities,requiredSkills,preferredSkills,experienceRequired,minimumExperienceYears,status,salaryMin,salaryMax,currency,education,applicationDeadline,allowReferrals,tags
Senior Backend Engineer,Engineering,Remote,FULL_TIME,2,"Own backend services and APIs","Design REST APIs; review code; mentor juniors","Node.js,PostgreSQL,TypeScript","AWS,Docker","3-5 years",3,OPEN,1500000,2200000,INR,B.Tech,,yes,backend|urgent
Product Designer,Design,Bangalore,FULL_TIME,1,"Lead product design for hiring workflows","User research; wireframes; design system","Figma,UX Research,Prototyping","Illustrator","2-4 years",2,OPEN,,,INR,B.Des,,yes,design
`;

const HEADER_ALIASES: Record<string, keyof JobCsvFieldMap> = {
  title: "title",
  job_title: "title",
  jobtitle: "title",
  position_title: "title",
  position: "title",
  role_title: "title",
  department: "department",
  dept: "department",
  location: "location",
  loc: "location",
  work_location: "location",
  work_locations: "location",
  locations: "location",
  status: "status",
  employment_type: "employmentType",
  employmenttype: "employmentType",
  job_type: "employmentType",
  job_type_fte_c2h: "employmentType",
  jobtype: "employmentType",
  openings: "numberOfOpenings",
  number_of_openings: "numberOfOpenings",
  numberofopenings: "numberOfOpenings",
  no_of_positions: "numberOfOpenings",
  no_of_position: "numberOfOpenings",
  positions: "numberOfOpenings",
  role_summary: "roleSummary",
  rolesummary: "roleSummary",
  summary: "roleSummary",
  key_responsibilities: "keyResponsibilities",
  keyresponsibilities: "keyResponsibilities",
  responsibilities: "keyResponsibilities",
  detailed_jd: "detailedJd",
  detailed_job_description: "detailedJd",
  job_description: "detailedJd",
  job_desc: "detailedJd",
  jd: "detailedJd",
  description: "detailedJd",
  required_skills: "requiredSkills",
  requiredskills: "requiredSkills",
  mandatory_skills: "requiredSkills",
  must_have_skills: "requiredSkills",
  skills: "requiredSkills",
  preferred_skills: "preferredSkills",
  preferredskills: "preferredSkills",
  experience_required: "experienceRequired",
  experiencerequired: "experienceRequired",
  exp_range: "experienceRequired",
  experience_range: "experienceRequired",
  experience: "experienceRequired",
  years_of_experience: "experienceRequired",
  minimum_experience_years: "minimumExperienceYears",
  minimumexperienceyears: "minimumExperienceYears",
  min_experience_years: "minimumExperienceYears",
  pipeline_stages: "pipelineStages",
  pipelinestages: "pipelineStages",
  salary_min: "salaryMin",
  salarymin: "salaryMin",
  salary_max: "salaryMax",
  salarymax: "salaryMax",
  ctc: "ctc",
  ctc_details: "ctc",
  ctc_details_no_bill_rate: "ctc",
  package: "ctc",
  compensation: "ctc",
  currency: "currency",
  education: "education",
  location_constraints: "locationConstraints",
  locationconstraints: "locationConstraints",
  application_deadline: "applicationDeadline",
  applicationdeadline: "applicationDeadline",
  allow_referrals: "allowReferrals",
  allowreferrals: "allowReferrals",
  tags: "tags",
  resume_match_threshold: "resumeMatchThreshold",
  resumematchthreshold: "resumeMatchThreshold",
};

type JobCsvFieldMap = {
  title: string;
  department: string;
  location: string;
  status: string;
  employmentType: string;
  numberOfOpenings: string;
  roleSummary: string;
  keyResponsibilities: string;
  detailedJd: string;
  requiredSkills: string;
  preferredSkills: string;
  experienceRequired: string;
  minimumExperienceYears: string;
  pipelineStages: string;
  salaryMin: string;
  salaryMax: string;
  ctc: string;
  currency: string;
  education: string;
  locationConstraints: string;
  applicationDeadline: string;
  allowReferrals: string;
  tags: string;
  resumeMatchThreshold: string;
};

/** Decode Excel/vendor CSVs (often windows-1252) without mojibake. */
export function decodeJobCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const utf8 = new TextDecoder("utf-8").decode(view);
  if (!utf8.includes("\uFFFD")) return utf8.replace(/^\uFEFF/, "");
  return new TextDecoder("windows-1252").decode(view);
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\u2007\u202F\uFFFD]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Parse RFC4180-style CSV into rows of string cells. */
export function parseCsvText(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || (c === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      if (c === "\r") i++;
    } else if (c !== "\r") {
      field += c;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export type ParsedJobCsvRow = {
  rowNumber: number;
  values: Partial<Record<keyof JobCsvFieldMap, string>>;
};

export function parseJobCsv(content: string): { rows: ParsedJobCsvRow[]; error?: string } {
  const matrix = parseCsvText(content);
  if (matrix.length === 0) {
    return { rows: [], error: "CSV file is empty." };
  }

  const headerRow = matrix[0];
  const columnKeys: (keyof JobCsvFieldMap | null)[] = headerRow.map((h) => {
    const key = HEADER_ALIASES[normalizeHeader(h)];
    return key ?? null;
  });

  if (!columnKeys.some((k) => k === "title")) {
    return { rows: [], error: 'CSV must include a "title" column.' };
  }

  const rows: ParsedJobCsvRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (cells.every((c) => !c.trim())) continue;

    const values: Partial<Record<keyof JobCsvFieldMap, string>> = {};
    for (let col = 0; col < columnKeys.length; col++) {
      const key = columnKeys[col];
      if (!key) continue;
      const cell = (cells[col] ?? "").trim();
      if (cell) values[key] = cell;
    }

    rows.push({ rowNumber: i + 1, values });
  }

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found in CSV." };
  }
  if (rows.length > JOB_CSV_MAX_ROWS) {
    return {
      rows: [],
      error: `CSV exceeds the maximum of ${JOB_CSV_MAX_ROWS} job rows per import.`,
    };
  }

  return { rows };
}

function normalizeEmploymentType(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/[\s/-]+/g, "_");
  if (
    s === "FULLTIME" ||
    s === "FULL_TIME" ||
    s === "FTE" ||
    s === "PERMANENT" ||
    s === "FULL_TIME_EMPLOYEE"
  ) {
    return "FULL_TIME";
  }
  if (s === "INTERNSHIP" || s === "INTERN") return "INTERNSHIP";
  if (
    s === "CONTRACT" ||
    s === "C2H" ||
    s === "CONTRACT_TO_HIRE" ||
    s === "C2HIRE" ||
    s === "CONSULTANT"
  ) {
    return "CONTRACT";
  }
  return s;
}

function normalizeApiStatus(raw: string | undefined): string {
  if (!raw?.trim()) return "OPEN";
  const s = raw.trim().toUpperCase();
  if (s === "OPEN" || s === "PAUSED" || s === "CLOSED") return s;
  return "OPEN";
}

function splitList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

/** Parse "8-16Yrs" / "9 -14 years" → display string + min years. */
function parseExperience(raw: string | undefined): {
  experienceRequired: string;
  minimumExperienceYears: number | undefined;
} {
  if (!raw?.trim()) return { experienceRequired: "", minimumExperienceYears: undefined };
  const s = raw.trim().replace(/[–—]/g, "-");
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-to]+\s*(\d+(?:\.\d+)?)/i);
  if (range) {
    const min = Math.floor(Number(range[1]));
    const max = Math.floor(Number(range[2]));
    return {
      experienceRequired: clip(`${min}-${max} years`, JOB_FIELD_LIMITS.experienceRequired),
      minimumExperienceYears: Number.isFinite(min) ? min : undefined,
    };
  }
  const single = s.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)?/i);
  if (single) {
    const min = Math.floor(Number(single[1]));
    return {
      experienceRequired: clip(s.replace(/yrs?/gi, "years"), JOB_FIELD_LIMITS.experienceRequired),
      minimumExperienceYears: Number.isFinite(min) ? min : undefined,
    };
  }
  return { experienceRequired: clip(s, JOB_FIELD_LIMITS.experienceRequired), minimumExperienceYears: undefined };
}

/** Parse Indian LPA / absolute salary text into INR amounts. */
function parseSalaryFields(values: Partial<Record<keyof JobCsvFieldMap, string>>): {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
} {
  const explicitMin = values.salaryMin?.trim();
  const explicitMax = values.salaryMax?.trim();
  if (explicitMin && /^\d+(\.\d+)?$/.test(explicitMin)) {
    return {
      salaryMin: Number(explicitMin),
      salaryMax: explicitMax && /^\d+(\.\d+)?$/.test(explicitMax) ? Number(explicitMax) : null,
      currency: values.currency?.trim().toUpperCase() || "INR",
    };
  }

  const ctc = (values.ctc || values.salaryMin || "").trim();
  if (!ctc) {
    return {
      salaryMin: null,
      salaryMax: null,
      currency: values.currency?.trim().toUpperCase() ?? null,
    };
  }

  const lpa = /lpa|lakh|lac|\bla\b/i.test(ctc);
  const nums = [...ctc.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (nums.length === 0) {
    return { salaryMin: null, salaryMax: null, currency: values.currency?.trim().toUpperCase() ?? null };
  }

  const toInr = (n: number) => (lpa || n < 1000 ? Math.round(n * 100_000) : Math.round(n));
  const min = toInr(nums[0]);
  const max = nums.length > 1 ? toInr(nums[1]) : null;
  return {
    salaryMin: min,
    salaryMax: max != null && max >= min ? max : null,
    currency: values.currency?.trim().toUpperCase() || "INR",
  };
}

/** Skill list cells are short tokens; long prose is treated as notes (not skills). */
function looksLikeSkillList(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const parts = splitList(raw);
  if (parts.length === 0) return false;
  if (parts.length === 1 && parts[0].length > 60) return false;
  return parts.every((p) => p.length <= JOB_FIELD_LIMITS.skillsItem);
}

function deriveFromJd(jd: string): { roleSummary: string; keyResponsibilities: string } {
  const cleaned = jd
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const metaLine = /^(skill|exp|experience|role)\b/i;
  const summaryParts = lines.filter((l) => metaLine.test(l)).slice(0, 3);
  const bodyLines = lines.filter((l) => !metaLine.test(l));

  const roleSummary = clip(
    (summaryParts.length ? summaryParts.join(". ") + ". " : "") + bodyLines.slice(0, 2).join(" "),
    JOB_FIELD_LIMITS.roleSummary
  );

  const keyResponsibilities = clip(
    (bodyLines.length ? bodyLines : lines).join("\n"),
    JOB_FIELD_LIMITS.keyResponsibilities
  );

  return {
    roleSummary: roleSummary || clip(cleaned, JOB_FIELD_LIMITS.roleSummary),
    keyResponsibilities: keyResponsibilities || clip(cleaned, JOB_FIELD_LIMITS.keyResponsibilities),
  };
}

/** Map one CSV row to POST /api/jobs body shape. */
export function jobCsvRowToBody(values: Partial<Record<keyof JobCsvFieldMap, string>>): Record<string, unknown> {
  const jd = values.detailedJd?.trim() || "";
  const derived = jd ? deriveFromJd(jd) : { roleSummary: "", keyResponsibilities: "" };

  let roleSummary = values.roleSummary?.trim() || derived.roleSummary;
  let keyResponsibilities = values.keyResponsibilities?.trim() || derived.keyResponsibilities;

  // Vendor CSVs often put the full JD only in one column.
  if (!roleSummary && keyResponsibilities) {
    roleSummary = clip(keyResponsibilities, JOB_FIELD_LIMITS.roleSummary);
  }
  if (!keyResponsibilities && roleSummary) {
    keyResponsibilities = clip(roleSummary, JOB_FIELD_LIMITS.keyResponsibilities);
  }
  if (!roleSummary && jd) roleSummary = clip(jd, JOB_FIELD_LIMITS.roleSummary);
  if (!keyResponsibilities && jd) keyResponsibilities = clip(jd, JOB_FIELD_LIMITS.keyResponsibilities);

  const exp = parseExperience(values.experienceRequired);
  let minimumExperienceYears = values.minimumExperienceYears?.trim()
    ? Number(values.minimumExperienceYears)
    : exp.minimumExperienceYears;

  // Pull min years from JD "Exp – 9 -14 years" when Exp Range column absent/unparsed.
  if (minimumExperienceYears == null && jd) {
    const fromJd = parseExperience(jd.match(/exp(?:erience)?\s*[-–—:]?\s*([^\n]+)/i)?.[1]);
    if (fromJd.minimumExperienceYears != null) {
      minimumExperienceYears = fromJd.minimumExperienceYears;
    }
  }

  let requiredSkills = looksLikeSkillList(values.requiredSkills)
    ? splitList(values.requiredSkills)
    : [];
  if (requiredSkills.length === 0) {
    requiredSkills = extractKnownSkillsFromText(
      [jd, values.requiredSkills, values.roleSummary, values.keyResponsibilities, values.title]
        .filter(Boolean)
        .join("\n")
    );
  }

  const preferredSkills = looksLikeSkillList(values.preferredSkills)
    ? splitList(values.preferredSkills)
    : extractKnownSkillsFromText(values.preferredSkills ?? "");

  const salary = parseSalaryFields(values);
  const experienceRequired =
    exp.experienceRequired ||
    (minimumExperienceYears != null ? `${minimumExperienceYears}+ years` : "");

  return {
    title: values.title ?? "",
    department: values.department?.trim() || "General",
    location: values.location ?? "",
    status: normalizeApiStatus(values.status),
    employmentType: normalizeEmploymentType(values.employmentType ?? "FULL_TIME"),
    numberOfOpenings: values.numberOfOpenings?.trim() ? Number(values.numberOfOpenings) : 1,
    roleSummary: clip(roleSummary, JOB_FIELD_LIMITS.roleSummary),
    keyResponsibilities: clip(keyResponsibilities, JOB_FIELD_LIMITS.keyResponsibilities),
    requiredSkills,
    preferredSkills,
    experienceRequired,
    minimumExperienceYears,
    pipelineStages: splitList(values.pipelineStages),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    currency: salary.currency,
    education: values.education ?? null,
    locationConstraints: values.locationConstraints ?? null,
    applicationDeadline: values.applicationDeadline ?? null,
    allowReferrals: values.allowReferrals ?? "yes",
    tags: splitList(values.tags),
    resumeMatchThreshold: values.resumeMatchThreshold?.trim()
      ? Number(values.resumeMatchThreshold)
      : null,
    description: clip(roleSummary || jd, JOB_FIELD_LIMITS.description),
  };
}

export function downloadJobCsvTemplate(): void {
  const blob = new Blob([JOB_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jobs-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
