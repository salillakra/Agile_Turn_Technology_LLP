/**
 * Removes `.next` (and optional `.turbo`) so the dev server can rebuild a consistent bundle.
 * Use when you see ENOENT prerender-manifest.json or MODULE_NOT_FOUND for ./5873.js / vendor-chunks.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function rmIfExists(name) {
  const target = path.join(root, name);
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      console.log("[clean-next] Removed", target);
    }
  } catch (e) {
    console.error("[clean-next] Failed to remove", target, e);
    process.exit(1);
  }
}

rmIfExists(".next");
rmIfExists(".turbo");
