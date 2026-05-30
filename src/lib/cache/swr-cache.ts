import { getCache, setCache, tryAcquireCacheLock } from "@/src/lib/cache/cache-utils";

export type SwrCacheEnvelope<T> = {
  data: T;
  cachedAt: string;
};

export type SwrCacheRead<T> = {
  hit: boolean;
  /** True when cache is older than `freshTtlSec` but still within `staleTtlSec`. */
  stale: boolean;
  data: T | null;
  cachedAt: string | null;
};

function nowMs(): number {
  return Date.now();
}

function parseCachedAtMs(cachedAt: unknown): number | null {
  if (typeof cachedAt !== "string") return null;
  const t = Date.parse(cachedAt);
  return Number.isFinite(t) ? t : null;
}

export async function readSwrCache<T>(
  key: string,
  params: { freshTtlSec: number; staleTtlSec: number }
): Promise<SwrCacheRead<T>> {
  const freshMs = Math.max(1, Math.trunc(params.freshTtlSec)) * 1000;
  const staleMs = Math.max(freshMs, Math.max(1, Math.trunc(params.staleTtlSec)) * 1000);

  const cached = await getCache<unknown>(key);
  if (!cached.hit || cached.value == null) {
    return { hit: false, stale: false, data: null, cachedAt: null };
  }

  const v = cached.value as unknown;
  const isEnvelope =
    typeof v === "object" &&
    v != null &&
    "data" in (v as Record<string, unknown>) &&
    "cachedAt" in (v as Record<string, unknown>);

  const data = isEnvelope ? (v as SwrCacheEnvelope<T>).data : (v as T);
  const cachedAt = isEnvelope ? (v as SwrCacheEnvelope<T>).cachedAt : null;
  const cachedAtMs = parseCachedAtMs(cachedAt);
  if (cachedAtMs == null) {
    // Legacy/unversioned payload: treat as fresh hit (no SWR decision possible).
    return { hit: true, stale: false, data, cachedAt: null };
  }

  const ageMs = nowMs() - cachedAtMs;
  const stale = ageMs > freshMs && ageMs <= staleMs;
  const valid = ageMs <= staleMs;
  if (!valid) {
    return { hit: false, stale: false, data: null, cachedAt: null };
  }

  return { hit: true, stale, data, cachedAt };
}

export async function writeSwrCache<T>(
  key: string,
  data: T,
  params: { staleTtlSec: number }
): Promise<void> {
  const staleTtlSec = Math.max(1, Math.trunc(params.staleTtlSec));
  const envelope: SwrCacheEnvelope<T> = { data, cachedAt: new Date().toISOString() };
  await setCache(key, envelope, { ttlSec: staleTtlSec });
}

export async function swrRevalidateOnce(
  lockKey: string,
  lockTtlSec: number,
  fn: () => Promise<void>
): Promise<void> {
  const ok = await tryAcquireCacheLock(lockKey, lockTtlSec);
  if (!ok) return;
  try {
    await fn();
  } catch {
    // Background refresh must never fail the request path.
  }
}

