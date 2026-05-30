import type { NextResponse } from "next/server";
import { recordCacheAnalyticsEvent } from "@/src/lib/cache/cache-analytics";

export const DASHBOARD_API_ENDPOINT = {
  summary: "/api/dashboard/summary",
  charts: "/api/dashboard/charts",
  activity: "/api/dashboard/activity",
} as const;

/** One JSON line per request for log aggregators (p95 response time, error rate, cache hit ratio). */
export type DashboardTelemetryEvent = {
  kind: "dashboard_api";
  endpoint: string;
  role: string;
  /** Cache layer: hit / miss (computed path) / n/a (endpoint has no dashboard cache). */
  cacheHit: "hit" | "miss" | "n/a";
  /** Wall-clock time spent in DB-backed work (0 on full cache hit or auth-only failures). */
  queryTimeMs: number;
  /** Total handler wall time until response is ready. */
  responseTimeMs: number;
  /** True for HTTP 2xx (same as `NextResponse.ok`). */
  ok: boolean;
  httpStatus: number;
  /** True for HTTP 5xx — use for server error rate in dashboards/alerts. */
  serverError: boolean;
  errorCode?: string;
  ts: string;
};

function telemetryDisabled(): boolean {
  const v = process.env.DASHBOARD_TELEMETRY?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

/** Emit structured telemetry to stdout (JSON). */
export function emitDashboardTelemetry(
  partial: Omit<DashboardTelemetryEvent, "kind" | "ts" | "serverError"> & { serverError?: boolean }
): void {
  if (telemetryDisabled()) return;
  const serverError =
    partial.serverError ??
    (partial.httpStatus >= 500 && partial.httpStatus <= 599);
  const row: DashboardTelemetryEvent = {
    kind: "dashboard_api",
    ...partial,
    serverError,
    ts: new Date().toISOString(),
  };
  console.log(JSON.stringify(row));
}

/** Log and return the same response (total time = time since `startedAt`). */
export function withDashboardTelemetry(
  response: NextResponse,
  opts: {
    endpoint: string;
    role: string;
    startedAt: number;
    cacheHit: "hit" | "miss" | "n/a";
    queryTimeMs: number;
    errorCode?: string;
  }
): NextResponse {
  void recordCacheAnalyticsEvent({
    endpoint: opts.endpoint,
    cache: opts.cacheHit,
    responseTimeMs: Date.now() - opts.startedAt,
  });
  emitDashboardTelemetry({
    endpoint: opts.endpoint,
    role: opts.role,
    cacheHit: opts.cacheHit,
    queryTimeMs: opts.queryTimeMs,
    responseTimeMs: Date.now() - opts.startedAt,
    ok: response.ok,
    httpStatus: response.status,
    errorCode: opts.errorCode,
  });
  return response;
}
