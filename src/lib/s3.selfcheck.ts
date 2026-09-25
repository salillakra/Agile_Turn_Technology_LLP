/**
 * Runnable: npx tsx --env-file=.env src/lib/s3.selfcheck.ts
 */
import assert from "node:assert/strict";
import { deleteS3Object, ensureS3Bucket, getS3Object, putS3Object } from "./s3";

const key = `selfcheck/${Date.now()}.txt`;
const body = Buffer.from("s3-selfcheck");

await ensureS3Bucket();
await putS3Object(key, body, "text/plain");
const got = await getS3Object(key);
assert.ok(got);
assert.equal(got.toString("utf8"), "s3-selfcheck");
await deleteS3Object(key);
assert.equal(await getS3Object(key), null);

console.log("s3.selfcheck: ok");
