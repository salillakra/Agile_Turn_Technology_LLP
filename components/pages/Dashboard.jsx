"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { T, C } from "@/lib/helpers";
import { STAGES, STAGE_META, STAGE_LABEL_TO_API } from "@/data/mockData";
import {
  APPLICATION_STAGE_TO_UI_LABEL,
  CANDIDATE_SOURCE_TO_UI_LABEL,
} from "@/src/lib/applications-drilldown-ui";
import BarChart from "@/components/charts/BarChart";
import DonutChart from "@/components/charts/DonutChart";
import LineSparkline from "@/components/charts/LineSparkline";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const SOURCE_COLORS = ["#60A5FA", "#A78BFA", "#34D399", "#FB923C", "#F472B6", "#FBBF24"];

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function formatApiError(body, fallback) {
  const msg = body?.message || fallback;
  const reason = body?.details && typeof body.details === "object" && "reason" in body.details ? String(body.details.reason) : "";
  return reason ? `${msg} (${reason})` : msg;
}

function sparkFromNumber(v) {
  const n = typeof v === "number" && !Number.isNaN(v) ? Math.max(0, v) : 0;
  if (n === 0) return [0, 0, 0, 0, 0, 0];
  return [n * 0.45, n * 0.58, n * 0.68, n * 0.78, n * 0.9, n].map((x) =>
    Math.round(x * 10) / 10
  );
}

/** Uses last points from `GET /api/dashboard/charts` `monthlyTrend` for a real series; pads to 6. */
function sparkFromMonthlyTrend(trend, fallback) {
  if (!Array.isArray(trend) || trend.length === 0) return fallback;
  const counts = trend.map((t) => (typeof t.count === "number" ? t.count : 0));
  const last6 = counts.slice(-6);
  const out = [...last6];
  while (out.length < 6) out.unshift(0);
  return out;
}

function formatDeltaPct(pct) {
  if (pct == null || typeof pct !== "number" || Number.isNaN(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}% vs prev`;
}

function sourceLabel(apiKey) {
  if (apiKey === "UNKNOWN" || apiKey == null) return "Unknown";
  return CANDIDATE_SOURCE_TO_UI_LABEL[apiKey] ?? String(apiKey);
}

/**
 * Live dashboard: `GET /api/dashboard/summary`, `/api/dashboard/charts`, `/api/dashboard/activity`.
 */
export default function Dashboard() {
  const [range, setRange] = useState("30d");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [charts, setCharts] = useState(null);
  const [activityFeed, setActivityFeed] = useState({
    rows: [],
    nextCursor: null,
    hasMore: false,
  });
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (range === "all") setCompareEnabled(false);
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    const qs = encodeURIComponent(range);
    const compareQs =
      compareEnabled && range !== "all" ? `&compare=${encodeURIComponent("true")}` : "";
    setLoadState("loading");
    setError(null);

    Promise.all([
      fetch(`/api/dashboard/summary?range=${qs}${compareQs}`, { credentials: "same-origin" }).then(
        readJson
      ),
      fetch(`/api/dashboard/charts?range=${qs}`, { credentials: "same-origin" }).then(readJson),
      fetch(`/api/dashboard/activity?limit=8`, { credentials: "same-origin" }).then(readJson),
    ])
      .then(([sum, chart, act]) => {
        if (cancelled) return;
        if (!sum.ok) {
          setLoadState("error");
          setError(formatApiError(sum.body, `Summary failed (${sum.status})`));
          return;
        }
        if (!chart.ok) {
          setLoadState("error");
          setError(formatApiError(chart.body, `Charts failed (${chart.status})`));
          return;
        }
        setSummary(sum.body);
        setCharts(chart.body);
        const body = act.ok && act.body ? act.body : { activity: [], nextCursor: null, hasMore: false };
        setActivityFeed({
          rows: body.activity ?? [],
          nextCursor: body.nextCursor ?? null,
          hasMore: !!body.hasMore,
        });
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
  }, [range, refreshKey, compareEnabled]);

  const loadMoreActivity = () => {
    const cursor = activityFeed.nextCursor;
    if (!cursor || activityLoadingMore) return;
    setActivityLoadingMore(true);
    fetch(`/api/dashboard/activity?limit=8&cursor=${encodeURIComponent(cursor)}`, {
      credentials: "same-origin",
    })
      .then(readJson)
      .then((res) => {
        if (!res.ok) return;
        const body = res.body;
        const next = body?.activity ?? [];
        setActivityFeed((prev) => ({
          rows: [...prev.rows, ...next],
          nextCursor: body?.nextCursor ?? null,
          hasMore: !!body?.hasMore,
        }));
      })
      .finally(() => setActivityLoadingMore(false));
  };

  const stageDistribution = charts?.stageDistribution ?? [];
  const sourceDistribution = charts?.sourceDistribution ?? [];
  const departmentDistribution = charts?.departmentDistribution ?? [];
  const monthlyTrend = charts?.monthlyTrend ?? [];
  const activityRows = activityFeed.rows;

  const stageByLabel = new Map();
  for (const row of stageDistribution) {
    const label = APPLICATION_STAGE_TO_UI_LABEL[row.stage] ?? row.stage;
    stageByLabel.set(label, row);
  }

  const totalApplications = summary?.totalApplications ?? 0;
  const offerRatePct = summary?.offerRate != null ? Math.round(Number(summary.offerRate) * 100) : 0;
  const avgHireDays =
    summary?.averageTimeToHire != null ? Math.round(Number(summary.averageTimeToHire) * 10) / 10 : 0;
  const appsSpark = sparkFromMonthlyTrend(monthlyTrend, sparkFromNumber(summary?.totalApplications ?? 0));

  const kpis =
    summary && loadState === "ok"
      ? [
          {
            label: "Open roles",
            value: summary.openJobs ?? 0,
            sub: `${summary.totalJobs ?? 0} total jobs`,
            color: "#60A5FA",
            sparkline: sparkFromNumber(summary.openJobs ?? 0),
          },
          {
            label: "Applications",
            value: summary.totalApplications ?? 0,
            sub: [
              `${summary.totalCandidates ?? 0} unique candidates`,
              formatDeltaPct(summary.totalApplicationsChangePercent),
            ]
              .filter(Boolean)
              .join(" · "),
            color: "#A78BFA",
            sparkline: appsSpark,
          },
          {
            label: "Active pipeline",
            value: summary.activePipelineCount ?? 0,
            sub: ["non-terminal", formatDeltaPct(summary.activePipelineCountChangePercent)]
              .filter(Boolean)
              .join(" · "),
            color: "#FB923C",
            sparkline: sparkFromNumber(summary.activePipelineCount ?? 0),
          },
          {
            label: "Hired",
            value: summary.hiredCount ?? 0,
            sub: ["in range", formatDeltaPct(summary.hiredCountChangePercent)].filter(Boolean).join(" · "),
            color: "#34D399",
            sparkline: sparkFromNumber(summary.hiredCount ?? 0),
          },
          {
            label: "Offer rate",
            value: `${offerRatePct}%`,
            sub: ["offers / applications", formatDeltaPct(summary.offerRateChangePercent)]
              .filter(Boolean)
              .join(" · "),
            color: "#F472B6",
            sparkline: sparkFromNumber(offerRatePct),
          },
          {
            label: "Avg. time to hire",
            value: `${avgHireDays}d`,
            sub: ["hired applications", formatDeltaPct(summary.averageTimeToHireChangePercent)]
              .filter(Boolean)
              .join(" · "),
            color: "#FBBF24",
            sparkline: sparkFromNumber(avgHireDays),
          },
        ]
      : [];

  const funnelRows = STAGES.map((label) => {
    const row = stageByLabel.get(label);
    const n = row?.count ?? 0;
    const pct = totalApplications > 0 ? (n / totalApplications) * 100 : 0;
    const m = STAGE_META[label];
    const stageApi = STAGE_LABEL_TO_API[label];
    const href =
      row?.applicantsDrillDownHref ??
      (stageApi ? `/applicants?stage=${encodeURIComponent(stageApi)}` : "/applicants");
    return { label, n, pct, m, href };
  });

  const donutData = sourceDistribution
    .filter((s) => s.count > 0)
    .map((s, i) => ({
      label: sourceLabel(s.source).slice(0, 12),
      value: s.count,
      color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }));

  const sourceLinks = sourceDistribution
    .filter((s) => s.count > 0)
    .map((s, i) => ({
      label: sourceLabel(s.source),
      short: sourceLabel(s.source).slice(0, 10),
      count: s.count,
      color: SOURCE_COLORS[i % SOURCE_COLORS.length],
      href: s.applicantsDrillDownHref || "/applicants",
    }));

  const deptBar = departmentDistribution.map((d) => ({
    label: d.department.length > 10 ? `${d.department.slice(0, 10)}…` : d.department,
    value: d.count,
  }));

  return (
    <div role="region" aria-label="Command center dashboard" aria-busy={loadState === "loading"}>
      <div
        style={{
          marginBottom: 28,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <p
            style={{
              ...T.mono,
              margin: "0 0 4px",
              color: "#3B82F6",
              textTransform: "uppercase",
              letterSpacing: ".12em",
            }}
          >
            Recruitment Operations
          </p>
          <h1 style={{ ...T.h1, margin: 0 }}>Command Center</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span id="dashboard-range-label" style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>
            Range
          </span>
          <Select
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS}
            style={{ minWidth: 160 }}
            aria-labelledby="dashboard-range-label"
          />
          <label
            style={{
              ...T.mono,
              fontSize: 11,
              color: range === "all" ? "var(--text-muted)" : "var(--text-body)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: range === "all" ? "not-allowed" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={compareEnabled && range !== "all"}
              disabled={range === "all"}
              onChange={(e) => setCompareEnabled(e.target.checked)}
              aria-label="Compare KPIs to the previous period of the same length"
            />
            Compare period
          </label>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Refresh dashboard data"
            style={{
              ...T.mono,
              fontSize: 11,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "var(--chrome-muted-bg)",
              color: "var(--text-body)",
              cursor: "pointer",
              outlineColor: "#3B82F6",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loadState === "loading" && (
        <p role="status" aria-live="polite" style={{ ...T.mono, color: "var(--text-muted)", marginBottom: 24 }}>
          Loading dashboard…
        </p>
      )}

      {loadState === "error" && error && (
        <div
          role="alert"
          style={{
            marginBottom: 24,
            padding: "14px 18px",
            borderRadius: 8,
            background: "rgba(248,113,113,.12)",
            border: "1px solid rgba(248,113,113,.4)",
            color: "#FCA5A5",
            ...T.mono,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {loadState === "ok" && summary && charts && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
              gap: 14,
              marginBottom: 24,
            }}
          >
            {kpis.map((k) => (
              <Card key={k.label} style={{ padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ ...T.mono, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".08em" }}>
                      {k.label}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 28,
                        fontWeight: 800,
                        color: k.color,
                        fontFamily: "'Fraunces',serif",
                      }}
                    >
                      {k.value}
                    </p>
                    <p style={{ ...T.mono, margin: "4px 0 0", fontSize: 10 }}>{k.sub}</p>
                  </div>
                  <LineSparkline values={k.sparkline} color={k.color} aria-hidden />
                </div>
              </Card>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card style={{ padding: "20px 22px" }}>
              <p style={{ ...T.h3, marginBottom: 16 }}>PIPELINE FUNNEL</p>
              {funnelRows.map(({ label, n, pct, m, href }) => (
                <Link
                  key={label}
                  href={href}
                  title={`View applications — ${label}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 9,
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: 110, ...T.mono, fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: "var(--funnel-track-bg)",
                      borderRadius: 99,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: m?.color || "var(--text-muted)",
                        borderRadius: 99,
                        transition: "width .5s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: 32,
                      textAlign: "right",
                      ...T.mono,
                      fontSize: 11,
                      color: m?.color || "var(--text-muted)",
                      fontWeight: 700,
                    }}
                  >
                    {n}
                  </div>
                </Link>
              ))}
            </Card>
            <Card style={{ padding: "20px 22px", flex: 1 }}>
              <p style={{ ...T.h3, marginBottom: 14 }}>BY SOURCE</p>
              {donutData.length === 0 ? (
                <p style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>No applications in this range.</p>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <DonutChart size={100} data={donutData} />
                  <div style={{ flex: 1 }}>
                    {sourceLinks.map((s) => (
                      <Link
                        key={`${s.label}-${s.count}`}
                        href={s.href}
                        title={`View applications — ${s.label}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <span style={{ ...T.mono, fontSize: 10, color: s.color }}>● {s.short}</span>
                        <span style={{ ...T.mono, fontSize: 10, fontWeight: 700, color: "var(--text-heading-soft)" }}>
                          {s.count}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
            <Card style={{ padding: "20px 22px" }}>
              <p style={{ ...T.h3, marginBottom: 14 }}>APPLICATIONS BY DEPARTMENT</p>
              {deptBar.length === 0 ? (
                <p style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>No data in this range.</p>
              ) : (
                <BarChart data={deptBar} valueKey="value" labelKey="label" color="#60A5FA" height={110} />
              )}
            </Card>
            <Card style={{ padding: "20px 22px" }}>
              <p style={{ ...T.h3, marginBottom: 14 }}>RECENT ACTIVITY</p>
              {activityRows.length === 0 ? (
                <p style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>No recent activity.</p>
              ) : (
                activityRows.map((log) => {
                  const name = log.user?.name || "System";
                  const initial = name.charAt(0).toUpperCase();
                  const when = log.createdAt ? new Date(log.createdAt).toLocaleString() : "";
                  return (
                    <div
                      key={log.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "7px 0",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: "rgba(59,130,246,.15)",
                          color: "#60A5FA",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 12,
                          fontFamily: "'Fraunces',serif",
                        }}
                      >
                        {initial}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-heading-soft)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </p>
                        <p
                          style={{
                            ...T.mono,
                            margin: 0,
                            fontSize: 10,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: "var(--text-body)",
                          }}
                        >
                          {log.action}
                          {log.applicationId ? ` · ${log.applicationId.slice(0, 8)}…` : ""}
                        </p>
                        <p style={{ ...T.mono, margin: "2px 0 0", fontSize: 9, color: "var(--text-muted)" }}>{when}</p>
                      </div>
                    </div>
                  );
                })
              )}
              {activityFeed.hasMore ? (
                <button
                  type="button"
                  onClick={loadMoreActivity}
                  disabled={activityLoadingMore || !activityFeed.nextCursor}
                  aria-label="Load more activity"
                  style={{
                    ...T.mono,
                    marginTop: 12,
                    fontSize: 11,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: "var(--chrome-muted-bg)",
                    color: "var(--text-body)",
                    cursor: activityLoadingMore ? "wait" : "pointer",
                    width: "100%",
                    outlineColor: "#3B82F6",
                  }}
                >
                  {activityLoadingMore ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
