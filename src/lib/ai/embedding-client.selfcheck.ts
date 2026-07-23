/**
 * Runnable check: npx tsx src/lib/ai/embedding-client.selfcheck.ts
 * Fails if Coolify compose hostname is rewritten to loopback.
 */
import assert from "node:assert/strict";
import { resolveAiServiceBaseUrl } from "./embedding-client";

const prev = process.env.AI_SERVICE_URL;
process.env.AI_SERVICE_URL = "http://ai-service:8000/";
assert.equal(resolveAiServiceBaseUrl(), "http://ai-service:8000");
assert.equal(
  resolveAiServiceBaseUrl({ baseUrl: "http://127.0.0.1:9000" }),
  "http://127.0.0.1:9000"
);
if (prev === undefined) delete process.env.AI_SERVICE_URL;
else process.env.AI_SERVICE_URL = prev;
console.log("embedding-client.selfcheck: ok");
