import Redis from "ioredis";
import { describeRedisTarget, resolveRedisConfig } from "@/src/lib/redis-config";

export type RedisPingResult = {
  ok: boolean;
  target?: string;
  error?: string;
  code?: string;
};

/**
 * One-shot Redis connectivity check (does not use the shared singleton).
 * Used before opening Bull Board so users get a clear message instead of ECONNRESET.
 */
export async function pingRedisConfig(timeoutMs = 4000): Promise<RedisPingResult> {
  const config = resolveRedisConfig();
  if (!config) {
    return {
      ok: false,
      error: "Redis is not configured. Set REDIS_URL or REDIS_HOST in .env.",
    };
  }

  const target = describeRedisTarget(config);
  const baseOptions = {
    connectTimeout: timeoutMs,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  };

  const client =
    config.mode === "url"
      ? new Redis(config.url, baseOptions)
      : new Redis({
          ...baseOptions,
          host: config.host,
          port: config.port,
          password: config.password,
        });

  client.on("error", () => {
    /* avoid unhandled error events during ping */
  });

  try {
    await client.connect();
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Redis ping timed out")), timeoutMs);
      }),
    ]);
    await client.quit();
    if (pong !== "PONG") {
      return { ok: false, target, error: `Unexpected ping response: ${String(pong)}` };
    }
    return { ok: true, target };
  } catch (e) {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
    const err = e as NodeJS.ErrnoException & Error;
    return {
      ok: false,
      target,
      error: err.message,
      code: typeof err.code === "string" ? err.code : undefined,
    };
  }
}

export function formatRedisPingFailureHint(ping: RedisPingResult): string {
  const code = ping.code ?? "";
  const msg = (ping.error ?? "").toLowerCase();
  const isReset = code === "ECONNRESET" || msg.includes("econnreset");
  const isRefused = code === "ECONNREFUSED" || msg.includes("econnrefused");

  if (isReset || isRefused) {
    return [
      "Queue monitor needs Redis. From Windows, 127.0.0.1:6379 often fails when Redis runs in WSL.",
      "In WSL run: sudo service redis-server start && redis-cli ping (expect PONG).",
      "In Admin PowerShell refresh portproxy: netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=6379",
      "then netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=6379 connectaddress=<WSL_IP> connectport=6379",
      "(WSL_IP = output of wsl hostname -I). Test: node -e \"require('ioredis')('redis://127.0.0.1:6379').ping().then(console.log)\"",
    ].join(" ");
  }

  if (ping.error?.includes("not configured")) {
    return "Add REDIS_URL=redis://127.0.0.1:6379 to .env and start Redis.";
  }

  return ping.error
    ? `Redis at ${ping.target ?? "configured host"} is unreachable: ${ping.error}`
    : "Redis is unreachable. Start Redis and verify REDIS_URL in .env.";
}
