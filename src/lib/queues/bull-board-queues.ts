/**
 * Bull Board–only Queue instances with a dedicated Redis connection.
 * Avoids reusing API singleton queues that may hold a stale ioredis client after ECONNRESET.
 */

import { Queue } from "bullmq";
import type Redis from "ioredis";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createRedisClient } from "@/src/lib/redis-connection";
import { listBullMqQueueNames } from "@/src/lib/queues/queue-names";

let monitorRedis: Redis | null = null;
let monitorQueues: Queue[] | null = null;

export function createBullBoardAdapters(): BullMQAdapter[] {
  if (!monitorRedis) {
    const client = createRedisClient({ purpose: "bullmq", optional: false });
    if (!client) {
      throw new Error("Failed to create Bull Board Redis connection");
    }
    monitorRedis = client;
  }

  if (!monitorQueues) {
    monitorQueues = listBullMqQueueNames().map(
      (name) =>
        new Queue(name, {
          connection: monitorRedis!,
        })
    );
  }

  return monitorQueues.map((queue) => new BullMQAdapter(queue));
}

export function getBullBoardQueueCount(): number {
  return monitorQueues?.length ?? 0;
}

export async function closeBullBoardQueues(): Promise<void> {
  if (monitorQueues) {
    const closes = monitorQueues.map((q) => q.close());
    monitorQueues = null;
    await Promise.allSettled(closes);
  }
  if (monitorRedis) {
    const client = monitorRedis;
    monitorRedis = null;
    try {
      await client.quit();
    } catch {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
