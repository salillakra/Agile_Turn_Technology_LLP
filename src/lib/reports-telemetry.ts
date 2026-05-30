import type { NextResponse } from "next/server";
import { recordCacheAnalyticsEvent } from "@/src/lib/cache/cache-analytics";

export type ReportsTelemetryEvent = {
  kind: "reports_api";
  endpoint: string;
  role: string;
  cacheHit: "hit" | "miss" | "n/a";
  queryTimeMs: number;
  responseTimeMs: number;
  ok: boolean;
  httpStatus: number;
  errorCode?: string;
  ts: string;
};

function telemetryDisabled(): boolean {
  const v = process.env.REPORTS_TELEMETRY?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

export function emitReportsTelemetry(
  partial: Omit<ReportsTelemetryEvent, "kind" | "ts">
): void {
  if (telemetryDisabled()) return;
  const row: ReportsTelemetryEvent = {
    kind: "reports_api",
    ...partial,
    ts: new Date().toISOString(),
  };
  console.log(JSON.stringify(row));
}

export function withReportsTelemetry(
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
  emitReportsTelemetry({
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

