import Redis, { type RedisOptions } from "ioredis";
import {
  describeRedisTarget,
  resolveRedisConfig,
  type RedisConfig,
} from "@/src/lib/redis-config";

/**
 * Connection profile:
 * - `bullmq` — `maxRetriesPerRequest: null` (required by BullMQ blocking commands)
 * - `cache` / `default` — bounded retries for optional dashboard use
 *
 * For cache reads/writes in API routes, use `@/src/lib/cache` (`getCache`, `setCache`, `deleteCache`).
 */
export type RedisClientPurpose = "default" | "bullmq" | "cache";

export type CreateRedisClientOptions = {
  purpose?: RedisClientPurpose;
  /** When true, returns null instead of throwing if Redis env is unset. */
  optional?: boolean;
};

function purposeToMaxRetries(purpose: RedisClientPurpose): number | null {
  return purpose === "bullmq" ? null : 2;
}

function buildRedisOptions(
  config: RedisConfig,
  purpose: RedisClientPurpose
): RedisOptions {
  const base: RedisOptions = {
    enableReadyCheck: true,
    lazyConnect: false,
    maxRetriesPerRequest: purposeToMaxRetries(purpose),
  };

  if (config.mode === "url") {
    return base;
  }

  return {
    ...base,
    host: config.host,
    port: config.port,
    password: config.password,
  };
}

/**
 * Creates a new ioredis client from env configuration.
 * BullMQ `Queue` / `Worker` should use `purpose: "bullmq"`.
 */
export function createRedisClient(
  options: CreateRedisClientOptions = {}
): Redis | null {
  const purpose = options.purpose ?? "default";
  const config = resolveRedisConfig();
  if (!config) {
    if (options.optional) return null;
    throw new Error(
      "Redis is not configured. Set REDIS_HOST/REDIS_PORT (and optional REDIS_PASSWORD) or REDIS_URL."
    );
  }

  const redisOptions = buildRedisOptions(config, purpose);

  const attachDefaultErrorHandler = (client: Redis): void => {
    // Ensure connection errors (ECONNREFUSED, etc.) never crash the process.
    // Shared clients also get an additional handler via `attachErrorHandler`.
    client.on("error", () => {
      /* handled via listeners */
    });
  };

  if (config.mode === "url") {
    const client = new Redis(config.url, redisOptions);
    attachDefaultErrorHandler(client);
    return client;
  }

  const client = new Redis(redisOptions);
  attachDefaultErrorHandler(client);
  return client;
}

const sharedClients = new Map<RedisClientPurpose, Redis>();
let sharedDisabledUntil = 0;
const SHARED_BACKOFF_MS = 30_000;

function attachErrorHandler(client: Redis, purpose: RedisClientPurpose): void {
  client.on("error", () => {
    sharedDisabledUntil = Date.now() + SHARED_BACKOFF_MS;
    const existing = sharedClients.get(purpose);
    if (existing === client) {
      sharedClients.delete(purpose);
      try {
        void existing.quit().catch(() => {
          /* ignore */
        });
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * Process-wide singleton per purpose (API handlers, future workers).
 * Returns `null` when Redis is unset or temporarily unavailable after errors.
 */
export function getSharedRedisClient(
  purpose: RedisClientPurpose = "default"
): Redis | null {
  if (!resolveRedisConfig()) return null;
  if (Date.now() < sharedDisabledUntil) return null;

  const existing = sharedClients.get(purpose);
  if (existing) return existing;

  try {
    const client = createRedisClient({ purpose, optional: true });
    if (!client) return null;
    attachErrorHandler(client, purpose);
    sharedClients.set(purpose, client);
    return client;
  } catch (e) {
    console.error(
      "[redis-connection] failed to connect (%s):",
      purpose,
      e instanceof Error ? e.message : e
    );
    sharedDisabledUntil = Date.now() + SHARED_BACKOFF_MS;
    return null;
  }
}

/** BullMQ-ready shared connection (`maxRetriesPerRequest: null`). */
export function getBullMqRedisConnection(): Redis | null {
  return getSharedRedisClient("bullmq");
}

/** Closes all shared clients (graceful worker shutdown). */
export async function closeSharedRedisClients(): Promise<void> {
  const closes = [...sharedClients.values()].map((client) => client.quit());
  sharedClients.clear();
  await Promise.allSettled(closes);
}

/** Log-friendly target when Redis is configured. */
export function getRedisTargetDescription(): string | null {
  const config = resolveRedisConfig();
  return config ? describeRedisTarget(config) : null;
}
