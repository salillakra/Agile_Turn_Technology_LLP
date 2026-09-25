/**
 * Runnable: npx tsx src/lib/storage/storage.selfcheck.ts
 */
import assert from "node:assert/strict";
import {
  buildResumeObjectKey,
  isSafeObjectKey,
  resumeKeyBelongsToCandidate,
  toResumeObjectKey,
} from "./object-keys";

const key = buildResumeObjectKey({ candidateId: "cand123", ext: ".pdf" });
assert.match(key, /^tenants\/default\/resumes\/cand123\/[0-9a-f-]+\.pdf$/);
assert.equal(isSafeObjectKey(key), true);
assert.equal(resumeKeyBelongsToCandidate(key, "cand123"), true);
assert.equal(resumeKeyBelongsToCandidate(key, "other"), false);
assert.equal(isSafeObjectKey("uploads/john.pdf"), false);
assert.equal(isSafeObjectKey("tenants/acme/resumes/847/3b8f2c.pdf"), true);
assert.equal(toResumeObjectKey("abc.pdf"), "resumes/abc.pdf");
assert.equal(toResumeObjectKey("../secret"), null);

console.log("storage.selfcheck: ok");
