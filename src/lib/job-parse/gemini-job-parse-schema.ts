/**
 * Gemini structured-output schema for job-description parse.
 */

import { Type, type Schema } from "@google/genai";

/** Enforced JSON shape returned by Gemini for JD parse. */
export const PARSED_JOB_GEMINI_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, nullable: true },
    department: { type: Type.STRING, nullable: true },
    location: { type: Type.STRING, nullable: true },
    employmentType: {
      type: Type.STRING,
      nullable: true,
      description: "FULL_TIME, CONTRACT, or INTERNSHIP when clearly stated; else null",
    },
    roleSummary: { type: Type.STRING, nullable: true },
    keyResponsibilities: { type: Type.STRING, nullable: true },
    requiredSkills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    preferredSkills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    experienceRequired: { type: Type.STRING, nullable: true },
    minimumExperienceYears: { type: Type.NUMBER, nullable: true },
    education: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER },
  },
  required: [
    "requiredSkills",
    "preferredSkills",
    "confidence",
  ],
};

export const GEMINI_JOB_PARSE_SYSTEM_INSTRUCTION = `You are a job-description parsing engine. Extract structured hiring fields from raw JD text and return JSON matching the schema. Do not invent facts. If a field is absent, return null or an empty list.

Rules:
- title: job title only (e.g. "Data Engineer"), not "Job Description – …" prefixes when avoidable.
- department: only if explicitly stated; otherwise null.
- location: city/region/remote if stated; otherwise null.
- employmentType: only FULL_TIME, CONTRACT, or INTERNSHIP when clearly implied; else null.
- roleSummary: concise summary from Job Summary / About the role (plain text).
- keyResponsibilities: responsibilities as a single plain-text block, one item per line, no bullet characters.
- requiredSkills / preferredSkills: atomic skill tokens as written (e.g. "React.js", "Java SE", "PySpark") — one skill per array element, not sentences.
- experienceRequired: human label as written (e.g. "7–10 Years", "10+ Years").
- minimumExperienceYears: integer lower bound only (7 from "7–10", 10 from "10+", 0 if entry-level); null if unknown.
- education: qualification line if present; else null.
- confidence: 0.0–1.0 for extraction completeness/clarity, not JD quality.

Return ONLY valid JSON matching the schema.`;
