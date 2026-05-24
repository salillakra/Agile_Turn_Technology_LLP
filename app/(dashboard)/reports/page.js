"use client";

import { useEffect, useState } from "react";
import Reports from "@/components/pages/Reports";
import { STAGES, STAGE_LABEL_TO_API } from "@/data/mockData";
import { CANDIDATE_SOURCE_TO_UI_LABEL } from "@/src/lib/applications-drilldown-ui";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function sourceLabel(apiKey) {
  if (apiKey === "UNKNOWN" || apiKey == null) return "Unknown";
  return CANDIDATE_SOURCE_TO_UI_LABEL[apiKey] ?? String(apiKey);
}

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export default function ReportsPage() {
  const [range, setRange] = useState("30d");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [charts, setCharts] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState(null);
  const [exportAudit, setExportAudit] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const qs = encodeURIComponent(range);
    setLoadState("loading");
    setError(null);
    setExportAudit(null);
    const compareQs = compareEnabled && range !== "all" ? "&compare=true" : "";
    Promise.all([
      fetch(`/api/dashboard/charts?range=${qs}`, { credentials: "same-origin" }).then(readJson),
      fetch(`/api/reports/overview?range=${qs}${compareQs}`, { credentials: "same-origin" }).then(readJson),
      fetch(`/api/reports/export-audit?limit=10`, { credentials: "same-origin" }).then(readJson),
    ])
      .then(([chartsRes, overviewRes, auditRes]) => {
        if (cancelled) return;
        if (!chartsRes.ok) {
          setLoadState("error");
          const msg = chartsRes.body?.message || `Charts failed (${chartsRes.status})`;
          const reason =
            chartsRes.body?.details && typeof chartsRes.body.details === "object" && "reason" in chartsRes.body.details
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
  }, [range, compareEnabled]);

  const stageBar =
    charts?.stageDistribution != null
      ? STAGES.map((label) => {
          const api = STAGE_LABEL_TO_API[label];
          const row = charts.stageDistribution.find((s) => s.stage === api);
          return {
            label,
            value: row?.count ?? 0,
            href: api ? `/applicants?stage=${encodeURIComponent(api)}` : "/applicants",
          };
        })
      : [];

  const deptBar = (charts?.departmentDistribution ?? []).map((d) => ({
    label: d.department.length > 5 ? `${d.department.slice(0, 5)}…` : d.department.slice(0, 5),
    value: d.count,
  }));

  const sourceBar = (charts?.sourceDistribution ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: sourceLabel(s.source).slice(0, 6),
      value: s.count,
      href:
        s.source && s.source !== "UNKNOWN"
          ? `/applicants?source=${encodeURIComponent(String(s.source))}`
          : "/applicants",
    }));

  return (
    <Reports
      range={range}
      onRangeChange={setRange}
      compareEnabled={compareEnabled}
      onCompareChange={setCompareEnabled}
      rangeOptions={RANGE_OPTIONS}
      stageBar={stageBar}
      deptBar={deptBar}
      sourceBar={sourceBar}
      overview={overview}
      exportAudit={exportAudit}
      loadState={loadState}
      error={error}
    />
  );
}
