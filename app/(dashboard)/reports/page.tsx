"use client";

import { useEffect, useState } from "react";
import Reports from "@/components/pages/Reports";
import { STAGES, STAGE_LABEL_TO_API } from "@/data/mockData";
import { CANDIDATE_SOURCE_TO_UI_LABEL } from "@/src/lib/applications-drilldown-ui";
import {
  dashboardDateRangeToSearchParams,
  defaultDashboardDateRange,
  isDashboardCompareAvailable,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";

function sourceLabel(apiKey: string) {
  if (apiKey === "UNKNOWN" || apiKey == null) return "Unknown";
  return CANDIDATE_SOURCE_TO_UI_LABEL[apiKey] ?? String(apiKey);
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DashboardDateRangeValue>(defaultDashboardDateRange);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [charts, setCharts] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [exportAudit, setExportAudit] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setError(null);
    setExportAudit(null);

    const params = dashboardDateRangeToSearchParams(dateRange);
    if (compareEnabled && isDashboardCompareAvailable(dateRange)) {
      params.set("compare", "true");
    }
    const qs = params.toString();

    Promise.all([
      fetch(`/api/dashboard/charts?${qs}`, { credentials: "same-origin" }).then(readJson),
      fetch(`/api/reports/overview?${qs}`, { credentials: "same-origin" }).then(readJson),
      fetch(`/api/reports/export-audit?limit=10`, { credentials: "same-origin" }).then(readJson),
    ])
      .then(([chartsRes, overviewRes, auditRes]) => {
        if (cancelled) return;
        if (!chartsRes.ok) {
          setLoadState("error");
          const msg = chartsRes.body?.message || `Charts failed (${chartsRes.status})`;
          const reason =
            chartsRes.body?.details &&
            typeof chartsRes.body.details === "object" &&
            "reason" in chartsRes.body.details
              ? String(chartsRes.body.details.reason)
              : "";
          setError(reason ? `${msg} (${reason})` : msg);
          return;
        }
        if (!overviewRes.ok) {
          setLoadState("error");
          setError(overviewRes.body?.message || `Overview failed (${overviewRes.status})`);
          return;
        }
        setCharts(chartsRes.body);
        setOverview(overviewRes.body);
        setExportAudit(auditRes.ok && Array.isArray(auditRes.body?.data) ? auditRes.body.data : []);
        setLoadState("ok");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setError("Network error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dateRange, compareEnabled]);

  const stageBar =
    charts?.stageDistribution != null
      ? STAGES.map((label) => {
          const api = STAGE_LABEL_TO_API[label];
          const row = charts.stageDistribution.find((s: { stage: string }) => s.stage === api);
          return {
            label,
            value: row?.count ?? 0,
            href: api ? `/applicants?stage=${encodeURIComponent(api)}` : "/applicants",
          };
        })
      : [];

  const deptBar = (charts?.departmentDistribution ?? []).map((d: { department: string; count: number }) => ({
    label: d.department.length > 5 ? `${d.department.slice(0, 5)}…` : d.department.slice(0, 5),
    value: d.count,
  }));

  const sourceBar = (charts?.sourceDistribution ?? [])
    .filter((s: { count: number }) => s.count > 0)
    .map((s: { source: string; count: number }) => ({
      label: sourceLabel(s.source).slice(0, 6),
      value: s.count,
      href:
        s.source && s.source !== "UNKNOWN"
          ? `/applicants?source=${encodeURIComponent(String(s.source))}`
          : "/applicants",
    }));

  return (
    <Reports
      dateRange={dateRange}
      onDateRangeChange={(next) => {
        setDateRange(next);
        if (!isDashboardCompareAvailable(next)) setCompareEnabled(false);
      }}
      compareEnabled={compareEnabled}
      onCompareChange={setCompareEnabled}
      stageBar={stageBar}
      deptBar={deptBar}
      sourceBar={sourceBar}
      overview={overview}
      exportAudit={exportAudit}
      loadState={loadState}
      error={error ?? undefined}
    />
  );
}
