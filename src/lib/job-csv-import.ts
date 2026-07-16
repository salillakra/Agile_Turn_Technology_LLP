/** CSV bulk import for jobs — column mapping, parsing, and template. */

export const JOB_CSV_MAX_ROWS = 100;

export const JOB_CSV_TEMPLATE = `title,department,location,employmentType,openings,roleSummary,keyResponsibilities,requiredSkills,preferredSkills,experienceRequired,minimumExperienceYears,status,salaryMin,salaryMax,currency,education,applicationDeadline,allowReferrals,tags
Senior Backend Engineer,Engineering,Remote,FULL_TIME,2,"Own backend services and APIs","Design REST APIs; review code; mentor juniors","Node.js,PostgreSQL,TypeScript","AWS,Docker","3-5 years",3,OPEN,1500000,2200000,INR,B.Tech,,yes,backend|urgent
Product Designer,Design,Bangalore,FULL_TIME,1,"Lead product design for hiring workflows","User research; wireframes; design system","Figma,UX Research,Prototyping","Illustrator","2-4 years",2,OPEN,,,INR,B.Des,,yes,design
`;

const HEADER_ALIASES: Record<string, keyof JobCsvFieldMap> = {
  title: "title",
  job_title: "title",
  jobtitle: "title",
  department: "department",
  dept: "department",
  location: "location",
  loc: "location",
  status: "status",
  employment_type: "employmentType",
  employmenttype: "employmentType",
  openings: "numberOfOpenings",
  number_of_openings: "numberOfOpenings",
  numberofopenings: "numberOfOpenings",
  role_summary: "roleSummary",
  rolesummary: "roleSummary",
  key_responsibilities: "keyResponsibilities",
  keyresponsibilities: "keyResponsibilities",
  required_skills: "requiredSkills",
  requiredskills: "requiredSkills",
  preferred_skills: "preferredSkills",
  preferredskills: "preferredSkills",
  experience_required: "experienceRequired",
  experiencerequired: "experienceRequired",
  minimum_experience_years: "minimumExperienceYears",
  minimumexperienceyears: "minimumExperienceYears",
  min_experience_years: "minimumExperienceYears",
  pipeline_stages: "pipelineStages",
  pipelinestages: "pipelineStages",
  salary_min: "salaryMin",
  salarymin: "salaryMin",
  salary_max: "salaryMax",
  salarymax: "salaryMax",
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
  requiredSkills: string;
  preferredSkills: string;
  experienceRequired: string;
  minimumExperienceYears: string;
  pipelineStages: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  education: string;
  locationConstraints: string;
  applicationDeadline: string;
  allowReferrals: string;
  tags: string;
  resumeMatchThreshold: string;
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
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
  const s = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "FULLTIME" || s === "FULL_TIME") return "FULL_TIME";
  if (s === "INTERNSHIP") return "INTERNSHIP";
  if (s === "CONTRACT") return "CONTRACT";
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

/** Map one CSV row to POST /api/jobs body shape. */
export function jobCsvRowToBody(values: Partial<Record<keyof JobCsvFieldMap, string>>): Record<string, unknown> {
  return {
    title: values.title ?? "",
    department: values.department ?? "",
    location: values.location ?? "",
    status: normalizeApiStatus(values.status),
    employmentType: normalizeEmploymentType(values.employmentType ?? "FULL_TIME"),
    numberOfOpenings: values.numberOfOpenings?.trim() ? Number(values.numberOfOpenings) : 1,
    roleSummary: values.roleSummary ?? "",
    keyResponsibilities: values.keyResponsibilities ?? "",
    requiredSkills: splitList(values.requiredSkills),
    preferredSkills: splitList(values.preferredSkills),
    experienceRequired: values.experienceRequired ?? "",
    minimumExperienceYears: values.minimumExperienceYears?.trim()
      ? Number(values.minimumExperienceYears)
      : undefined,
    pipelineStages: splitList(values.pipelineStages),
    salaryMin: values.salaryMin?.trim() ? Number(values.salaryMin) : null,
    salaryMax: values.salaryMax?.trim() ? Number(values.salaryMax) : null,
    currency: values.currency?.trim().toUpperCase() ?? null,
    education: values.education ?? null,
    locationConstraints: values.locationConstraints ?? null,
    applicationDeadline: values.applicationDeadline ?? null,
    allowReferrals: values.allowReferrals ?? "yes",
    tags: splitList(values.tags),
    resumeMatchThreshold: values.resumeMatchThreshold?.trim()
      ? Number(values.resumeMatchThreshold)
      : null,
    description: values.roleSummary ?? null,
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
