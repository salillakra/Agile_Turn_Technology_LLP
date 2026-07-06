/**
 * Gemini structured-output schema for resume parse (@google/genai).
 * @see https://googleapis.github.io/js-genai/release_docs/index.html
 */

import { Type, type Schema } from "@google/genai";

const workExperienceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    company: { type: Type.STRING },
    title: { type: Type.STRING },
    startDate: { type: Type.STRING, nullable: true },
    endDate: { type: Type.STRING, nullable: true },
    ongoing: { type: Type.BOOLEAN },
    description: { type: Type.STRING, nullable: true },
  },
  required: ["company", "title", "ongoing"],
};

const educationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    degree: { type: Type.STRING, nullable: true },
    institution: { type: Type.STRING, nullable: true },
    graduationYear: { type: Type.STRING, nullable: true },
    startDate: { type: Type.STRING, nullable: true },
    endDate: { type: Type.STRING, nullable: true },
  },
};

/** Enforced JSON shape returned by Gemini for POST hybrid LLM parse. */
export const PARSED_RESUME_GEMINI_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    email: { type: Type.STRING, nullable: true },
    phone: { type: Type.STRING, nullable: true },
    skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    normalizedSkills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    workExperience: {
      type: Type.ARRAY,
      items: workExperienceSchema,
    },
    education: {
      type: Type.ARRAY,
      items: educationSchema,
    },
    seniorityEstimate: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER },
  },
  required: ["skills", "normalizedSkills", "workExperience", "education", "confidence"],
};

export const GEMINI_RESUME_PARSE_SYSTEM_INSTRUCTION = `You are a resume parsing engine. You extract structured candidate data from raw resume text and return it strictly according to the provided schema. You do not invent information. If a field is not present in the text, return null or an empty list — never guess or fabricate.

Rules:
- Dates: normalize to YYYY-MM format where possible. If only a year is given, use YYYY. If "Present" or "Current" appears, set endDate to null and mark ongoing as true.
- Skills: extract both as literally written (skills[]) and as normalized/canonicalized terms (normalizedSkills[]) — e.g. "ReactJS" and "React.js" both normalize to "React".
- Seniority: estimate only from explicit signals (years of experience stated, job titles like "Senior", "Staff", "Lead", "Intern") — do not infer from company prestige or project complexity alone.
- Work experience: preserve original job titles and company names verbatim; do not paraphrase.
- Name: must be the person's full name only — never use section headings (e.g. "About Me", "Summary", "Profile", "Objective", "Contact").
- If the resume is not in English or is unparseable/garbled, set confidence to 0 and return empty arrays for structured fields, but still attempt name/email extraction if present.
- Confidence (0.0–1.0): reflect how complete and unambiguous the extraction was, not resume quality.

Return ONLY valid JSON matching the schema. No prose, no explanation.`;
