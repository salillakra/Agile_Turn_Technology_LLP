/**
 * Runnable check: vendor staffing CSV → job create payload.
 * Run: npx tsx scripts/check-job-csv-import.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeJobCsvBytes,
  jobCsvRowToBody,
  parseJobCsv,
} from "../src/lib/job-csv-import";
import { validateJobCreatePayload } from "../src/lib/job-validation";

const csvPath = resolve(process.cwd(), "Angular Lead (Team Lead exp).csv");
const content = decodeJobCsvBytes(readFileSync(csvPath));
const parsed = parseJobCsv(content);

assert.equal(parsed.error, undefined, parsed.error);
assert.equal(parsed.rows.length, 1);

const body = jobCsvRowToBody(parsed.rows[0].values);
assert.equal(body.title, "Angular Lead (Team Lead exp)");
assert.equal(body.numberOfOpenings, 12);
assert.equal(body.employmentType, "FULL_TIME");
assert.equal(body.location, "All Zensar");
assert.equal(body.department, "General");
assert.equal(body.experienceRequired, "8-16 years");
assert.equal(body.minimumExperienceYears, 8);
assert.equal(body.salaryMin, 3_500_000);
assert.equal(body.salaryMax, 5_000_000);
assert.equal(body.currency, "INR");
assert.ok(typeof body.roleSummary === "string" && body.roleSummary.length > 0);
assert.ok(typeof body.keyResponsibilities === "string" && body.keyResponsibilities.length > 0);
const skills = body.requiredSkills as string[];
assert.ok(skills.includes("angular"));
assert.ok(skills.includes("typescript"));
assert.ok(!skills.includes("go"), "must not treat English 'go' as Golang");

const validation = validateJobCreatePayload({
  title: String(body.title),
  department: String(body.department),
  location: String(body.location),
  jobMeta: {
    employmentType: String(body.employmentType),
    numberOfOpenings: Number(body.numberOfOpenings),
    roleSummary: String(body.roleSummary),
    keyResponsibilities: String(body.keyResponsibilities),
    requiredSkills: body.requiredSkills as string[],
    preferredSkills: body.preferredSkills as string[],
    experienceRequired: String(body.experienceRequired),
    minimumExperienceYears: Number(body.minimumExperienceYears),
    salaryMin: body.salaryMin as number | null,
    salaryMax: body.salaryMax as number | null,
    currency: body.currency as string | null,
  },
});
assert.equal(validation, null, validation?.error);

// Template-shaped row still maps.
const template = parseJobCsv(`title,department,location,employmentType,openings,roleSummary,keyResponsibilities,requiredSkills,experienceRequired,minimumExperienceYears
Backend,Engineering,Remote,FULL_TIME,1,Summary here,Ship APIs,Node.js,3-5 years,3
`);
assert.equal(template.error, undefined);
const tBody = jobCsvRowToBody(template.rows[0].values);
assert.equal(tBody.employmentType, "FULL_TIME");
assert.deepEqual(tBody.requiredSkills, ["Node.js"]);

console.log("check-job-csv-import: ok");
console.log(
  JSON.stringify(
    {
      title: body.title,
      department: body.department,
      location: body.location,
      employmentType: body.employmentType,
      numberOfOpenings: body.numberOfOpenings,
      experienceRequired: body.experienceRequired,
      minimumExperienceYears: body.minimumExperienceYears,
      requiredSkills: body.requiredSkills,
      salaryMin: body.salaryMin,
      salaryMax: body.salaryMax,
      currency: body.currency,
      roleSummaryChars: String(body.roleSummary).length,
      keyResponsibilitiesChars: String(body.keyResponsibilities).length,
    },
    null,
    2
  )
);
