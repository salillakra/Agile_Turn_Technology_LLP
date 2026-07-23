/**
 * Runnable: npx tsx hooks/queries/useSidebarNav.selfcheck.ts
 */
import assert from "node:assert/strict";
import { sidebarNavKeys } from "./sidebar-nav-keys";

assert.deepEqual(sidebarNavKeys.all, ["sidebar-nav"]);
assert.deepEqual(sidebarNavKeys.counts(), ["sidebar-nav", "counts"]);
console.log("useSidebarNav.selfcheck: ok");
