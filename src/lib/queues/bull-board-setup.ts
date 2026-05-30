import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getAllQueues } from "@/src/lib/queues/queues";
import { isRedisConfigured } from "@/src/lib/queues/redis";

/** Bull Board UI mount path (must match Express `app.use` and `serverAdapter.setBasePath`). */
export const QUEUE_MONITOR_BASE_PATH = "/admin/queues";

export function createQueueMonitorBoard(): ExpressAdapter {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(QUEUE_MONITOR_BASE_PATH);

  // Bull Board requires `Queue` instances. Our queues fail fast when Redis is not configured
  // (to avoid silently dropping background jobs). For local/dev, we still want the monitor
  // server to boot and show an empty board with a warning.
  const adapters: BullMQAdapter[] = (() => {
    if (!isRedisConfigured()) return [];
    try {
      return getAllQueues().map((queue) => new BullMQAdapter(queue));
    } catch {
      return [];
    }
  })();

  createBullBoard({
    queues: adapters,
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: adapters.length === 0 ? "ATS — BullMQ (Redis not configured)" : "ATS — BullMQ",
        boardLogo: { path: "", width: 0, height: 0 },
      },
    },
  });

  return serverAdapter;
}
