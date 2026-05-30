/**
 * Bull Board queue monitor (separate process from Next.js).
 *
 *   npm run monitor
 *
 * In development, the monitor also auto-starts when Next.js boots (see instrumentation.ts).
 */

import { runQueueMonitorServerCli } from "@/src/lib/queues/queue-monitor-server";

runQueueMonitorServerCli().catch((err) => {
  console.error("[monitor] fatal:", err);
  process.exit(1);
});
