/**
 * Runnable check for JD clean + LLM payload map + skill aliases (no Gemini).
 * Run: npx tsx scripts/check-job-jd-parse.ts
 */
import assert from "node:assert/strict";
import { cleanJdText } from "../src/lib/job-parse/clean-jd-text";
import {
  missingCreateFields,
  normalizeJobLlmPayload,
  parsedJobToCreateBody,
} from "../src/lib/job-parse/parse-job-description";
import { normalizeSkill, normalizeSkills } from "../src/lib/skill-normalizer";

const messy = `
Job Description – Data Engineer
Experience
7–10 Years
Required Skills
 Strong experience in Python programming.
• Hands-on experience with ReactJS.
- Knowledge of Java SE and JS.
`;

const cleaned = cleanJdText(messy);
assert.ok(!cleaned.includes(""), "bullets stripped");
assert.ok(!cleaned.includes("•"), "unicode bullets stripped");
assert.ok(!/^[-–—*]\s/m.test(cleaned) || !cleaned.includes("\n- "), "dash bullets stripped");
assert.ok(!/[ \t]{2,}/.test(cleaned.replace(/\n/g, " ")), "spaces collapsed");

assert.equal(normalizeSkill("Java SE"), "java");
assert.equal(normalizeSkill("ReactJS"), "react");
assert.equal(normalizeSkill("JS"), "javascript");
assert.equal(normalizeSkill("Core Java"), "java");
assert.deepEqual(normalizeSkills(["React.js", "reactjs", "JS"]), ["react", "javascript"]);

const parsed = normalizeJobLlmPayload({
  title: "Data Engineer",
  department: null,
  location: null,
  employmentType: null,
  roleSummary: "Build pipelines.",
  keyResponsibilities: "Design ETL\nOptimize Spark",
  requiredSkills: ["Python", "PySpark", "Java SE"],
  preferredSkills: ["Airflow"],
  experienceRequired: "7–10 Years",
  minimumExperienceYears: 7,
  education: "Bachelor's in CS",
  confidence: 0.9,
});
assert.ok(parsed);
assert.equal(parsed!.title, "Data Engineer");
assert.equal(parsed!.minimumExperienceYears, 7);
assert.deepEqual(parsed!.requiredSkills, ["Python", "PySpark", "Java SE"]);

const body = parsedJobToCreateBody(parsed!);
assert.equal(body.title, "Data Engineer");
assert.equal(body.department, "");
assert.deepEqual(missingCreateFields(body).sort(), [
  "department",
  "employmentType",
  "location",
].sort());

console.log("check-job-jd-parse: ok");
