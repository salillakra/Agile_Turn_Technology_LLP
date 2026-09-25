/**
 * Runnable: npx tsx src/lib/parse-progress.selfcheck.ts
 */
import assert from "node:assert/strict";
import { isResumeParseReady } from "./queue-job-status";
import { getResumeStorageFileNameFromResumeUrl } from "./resume-extract-text";

assert.equal(isResumeParseReady("COMPLETED"), true);
assert.equal(isResumeParseReady("PARTIAL"), true);
assert.equal(isResumeParseReady("FAILED"), false);
assert.equal(isResumeParseReady("PENDING"), false);
assert.equal(
  getResumeStorageFileNameFromResumeUrl("/api/resumes/local/abc%2Epdf"),
  "resumes/abc.pdf"
);
assert.equal(
  getResumeStorageFileNameFromResumeUrl(
    "/api/resumes/local/tenants%2Fdefault%2Fresumes%2Fc1%2Fabc.pdf"
  ),
  "tenants/default/resumes/c1/abc.pdf"
);
assert.equal(getResumeStorageFileNameFromResumeUrl("/api/resumes/local/../secret"), null);
assert.equal(getResumeStorageFileNameFromResumeUrl("https://example.com/x.pdf"), null);

console.log("parse-progress.selfcheck: ok");
