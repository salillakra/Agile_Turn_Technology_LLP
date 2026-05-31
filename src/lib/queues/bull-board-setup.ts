import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoardAdapters } from "@/src/lib/queues/bull-board-queues";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { QUEUE_MONITOR_BASE_PATH } from "@/src/lib/queue-monitor-access";

export { QUEUE_MONITOR_BASE_PATH };

export type CreateQueueMonitorBoardOptions = {
  /** When false, UI loads without BullMQ adapters (avoids ECONNRESET spam if Redis is down). */
  redisReachable?: boolean;
};

export function createQueueMonitorBoard(
  options: CreateQueueMonitorBoardOptions = {}
): ExpressAdapter {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(QUEUE_MONITOR_BASE_PATH);

  const redisReachable = options.redisReachable !== false;

  // Bull Board requires `Queue` instances. Our queues fail fast when Redis is not configured
  // (to avoid silently dropping background jobs). For local/dev, we still want the monitor
  // server to boot and show an empty board with a warning.
  const adapters: BullMQAdapter[] = (() => {
    if (!isRedisConfigured() || !redisReachable) return [];
    try {
      return createBullBoardAdapters();
    } catch (e) {
      console.warn(
        "[monitor] failed to attach BullMQ queues:",
        e instanceof Error ? e.message : e
      );
      return [];
    }
  })();

  createBullBoard({
    queues: adapters,
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: (() => {
          if (!isRedisConfigured()) return "ATS — BullMQ (Redis not configured)";
          if (!redisReachable) {
            return "ATS — BullMQ (Redis unreachable — fix connection, then refresh)";
          }
          if (adapters.length === 0) return "ATS — BullMQ (no queues loaded)";
          return "ATS — BullMQ";
        })(),
        boardLogo: { path: "", width: 0, height: 0 },
      },
    },
  });

  return serverAdapter;
}
