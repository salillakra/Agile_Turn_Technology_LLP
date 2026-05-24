"use client";

import { T } from "@/lib/helpers";
import Card from "@/components/ui/Card";
import BarChart from "@/components/charts/BarChart";
import Select from "@/components/ui/Select";
import Link from "next/link";

export default function Reports({
  range,
  onRangeChange,
  compareEnabled,
  onCompareChange,
  rangeOptions,
  stageBar,
  deptBar,
  sourceBar,
  overview,
  exportAudit,
  loadState,
  error,
}) {
  const compareAvailable = range !== "all";
  const currentOverview = overview?.currentPeriod ?? overview;
  const change = overview?.percentageChange ?? null;

  return (
    <div role="region" aria-label="Recruitment reports">
      <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
        <div>
          <p style={{ ...T.mono, margin: "0 0 4px", color: "#3B82F6", textTransform: "uppercase", letterSpacing: ".1em" }}>
            Analytics
          </p>
          <h1 style={T.h1}>Reports</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span id="reports-range-label" style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)" }}>
            Range
          </span>
          <Select
            value={range}
            onChange={onRangeChange}
            options={rangeOptions}
            style={{ minWidth: 160 }}
            aria-labelledby="reports-range-label"
          />
          <label
            style={{
              ...T.mono,
              fontSize: 11,
              color: compareAvailable ? "var(--text-body)" : "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              type="checkbox"
              checked={compareEnabled && compareAvailable}
              disabled={!compareAvailable}
              onChange={(e) => onCompareChange?.(e.target.checked)}
            />
            Compare
          </label>
        </div>
      </div>

      <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
        <p style={{ ...T.h3, marginBottom: 6 }} title="Download application rows for the selected date range (RBAC-scoped)">
          EXPORT DATA
        </p>
        <p style={{ ...T.mono, fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Uses the <strong style={{ color: "var(--text-body)" }}>Range</strong> control above. Stay signed in — each download is recorded under{" "}
          <strong style={{ color: "var(--text-body)" }}>Recent exports</strong>.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {[
            { format: "csv", label: "CSV" },
            { format: "xlsx", label: "Excel" },
            { format: "pdf", label: "PDF summary" },
          ].map(({ format, label }) => (
            <a
              key={format}
              href={`/api/reports/export?type=applications&range=${encodeURIComponent(range)}&format=${format}`}
              style={{
                ...T.mono,
                fontSize: 12,
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid rgba(96,165,250,.45)",
                color: "var(--accent)",
                textDecoration: "none",
                background: "rgba(59,130,246,.08)",
              }}
            >
              Download {label}
            </a>
          ))}
        </div>
      </Card>

      {loadState === "ok" && currentOverview && (
        <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
          <p style={{ ...T.h3, marginBottom: 8 }} title="Key performance indicators for selected filters">
            KPI SNAPSHOT
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            {[
              { key: "totalApplications", label: "Applications" },
              { key: "hiredCount", label: "Hired" },
              { key: "rejectedCount", label: "Rejected" },
              { key: "offerRate", label: "Offer rate" },
              { key: "conversionRate", label: "Conversion rate" },
            ].map((k) => (
              <div key={k.key}>
                <p style={{ ...T.mono, margin: 0, fontSize: 10 }}>{k.label}</p>
                <p style={{ margin: "2px 0", fontSize: 18, fontWeight: 700, color: "var(--text-heading-soft)" }}>
                  {k.key.includes("Rate")
                    ? `${Math.round((Number(currentOverview[k.key] ?? 0) || 0) * 100)}%`
                    : currentOverview[k.key] ?? 0}
                </p>
                {change ? (
                  <p style={{ ...T.mono, margin: 0, fontSize: 10, color: "var(--text-body)" }}>
                    {change[k.key] == null ? "n/a" : `${change[k.key] > 0 ? "+" : ""}${change[k.key]}%`}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}

      {loadState === "loading" && (
        <p role="status" aria-live="polite" style={{ ...T.mono, color: "var(--text-muted)", marginBottom: 16 }}>
          Loading charts…
        </p>
      )}

      {loadState === "error" && error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
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

      {loadState === "ok" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <Card style={{ padding: "20px 22px" }}>
            <p style={{ ...T.h3, marginBottom: 14 }} title="Distribution of applications by current pipeline stage">BY STAGE</p>
            <BarChart data={stageBar} valueKey="value" labelKey="label" color="#60A5FA" height={180} />
            <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
              {stageBar.map((s) => (
                <Link
                  key={s.label}
                  href={s.href || "/applicants"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    textDecoration: "none",
                    color: "inherit",
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                  }}
                  title={`View ${s.label} applications`}
                >
                  <span style={{ color: "var(--accent)" }}>{s.label}</span>
                  <span style={{ color: "var(--text-heading-soft)" }}>{s.value}</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card style={{ padding: "20px 22px" }}>
            <p style={{ ...T.h3, marginBottom: 14 }} title="Applications grouped by job department">BY DEPARTMENT</p>
            <BarChart data={deptBar} valueKey="value" labelKey="label" color="#A78BFA" height={180} />
          </Card>
          <Card style={{ padding: "20px 22px" }}>
            <p style={{ ...T.h3, marginBottom: 14 }} title="Candidate source mix and contribution">BY SOURCE</p>
            <BarChart data={sourceBar} valueKey="value" labelKey="label" color="#34D399" height={180} />
            <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
              {sourceBar.map((s) => (
                <Link
                  key={`${s.label}-${s.value}`}
                  href={s.href || "/applicants"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    textDecoration: "none",
                    color: "inherit",
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                  }}
                  title={`View ${s.label} applications`}
                >
                  <span style={{ color: "#16a34a" }}>{s.label}</span>
                  <span style={{ color: "var(--text-heading-soft)" }}>{s.value}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      {loadState === "ok" && exportAudit != null && (
        <Card style={{ marginTop: 16, padding: "16px 18px" }}>
          <p
            style={{ ...T.h3, marginBottom: 10 }}
            title="Audit log of report file downloads (CSV, XLSX, PDF). Admins see org-wide; others see their own."
          >
            RECENT EXPORTS
          </p>
          {exportAudit.length === 0 ? (
            <p style={{ ...T.mono, margin: 0, fontSize: 12, color: "var(--text-muted)" }}>No export downloads logged yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: "var(--text-body)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px 8px 0" }}>When (UTC)</th>
                    <th style={{ padding: "6px 8px 8px 0" }}>User</th>
                    <th style={{ padding: "6px 8px 8px 0" }}>Format</th>
                    <th style={{ padding: "6px 8px 8px 0" }}>Range</th>
                    <th style={{ padding: "6px 8px 8px 0" }}>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {exportAudit.map((row) => (
                    <tr key={row.id} style={{ color: "var(--text-heading-soft)", borderTop: "1px solid var(--app-border-strong)" }}>
                      <td style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>
                        {row.createdAt ? new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19) : "—"}
                      </td>
                      <td style={{ padding: "8px 8px 8px 0", maxWidth: 180 }} title={row.user?.email ?? ""}>
                        {row.user?.email ?? row.userId ?? "—"}
                      </td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{row.format ?? "—"}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{row.reportRange ?? "—"}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{row.rowCount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
