/**
 * Redis connection settings for BullMQ, dashboard cache, and rate limiting.
 *
 * Resolution order:
 * 1. `REDIS_URL` (full connection string, backward compatible)
 * 2. `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` (discrete fields for BullMQ workers)
 */

export type RedisHostConfig = {
  mode: "host";
  host: string;
  port: number;
  password?: string;
};

export type RedisUrlConfig = {
  mode: "url";
  url: string;
};

export type RedisConfig = RedisHostConfig | RedisUrlConfig;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 6379;

function parsePort(raw: string | undefined): number {
  if (raw == null || raw === "") return DEFAULT_PORT;
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid REDIS_PORT: ${raw}`);
  }
  return port;
}

/**
 * Returns parsed Redis settings, or `null` when Redis is not configured.
 */
export function resolveRedisConfig(): RedisConfig | null {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return { mode: "url", url };
  }

  const hostRaw = process.env.REDIS_HOST?.trim();
  const portRaw = process.env.REDIS_PORT?.trim();
  const passwordRaw = process.env.REDIS_PASSWORD?.trim();

  if (hostRaw || portRaw || passwordRaw) {
    return {
      mode: "host",
      host: hostRaw || DEFAULT_HOST,
      port: parsePort(portRaw),
      password: passwordRaw || undefined,
    };
  }

  return null;
}

/** True when any supported Redis env var is set. */
export function isRedisConfigured(): boolean {
  return resolveRedisConfig() != null;
}

/**
 * Safe summary for logs (never includes password).
 */
export function describeRedisTarget(config: RedisConfig): string {
  if (config.mode === "url") {
    try {
      const u = new URL(config.url);
      return `redis://${u.hostname}:${u.port || DEFAULT_PORT}`;
    } catch {
      return "redis://(REDIS_URL)";
    }
  }
  return `redis://${config.host}:${config.port}`;
}
