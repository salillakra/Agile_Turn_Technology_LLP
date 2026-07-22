#!/usr/bin/env node
/**
 * Self-check: feedback route must not enqueue interview_scheduled (double-send guard).
 * Run: node scripts/check-no-feedback-interview-scheduled.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const feedbackPath = join(root, "app/api/applications/[id]/feedback/route.ts");
const src = readFileSync(feedbackPath, "utf8");

const banned = [
  "scheduleInterviewScheduledCommunications",
  "scheduleInterviewScheduledEmail",
  "enqueueInterviewScheduledEmail",
];

const hits = banned.filter((name) => src.includes(name));
if (hits.length > 0) {
  console.error(
    "[check-no-feedback-interview-scheduled] FAIL — feedback route still references:",
    hits.join(", ")
  );
  process.exit(1);
}

console.log(
  "[check-no-feedback-interview-scheduled] OK — feedback route does not enqueue interview_scheduled"
);
