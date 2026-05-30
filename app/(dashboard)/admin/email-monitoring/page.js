"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All email types" },
  { value: "transactional", label: "Transactional" },
  { value: "stage_updates", label: "Stage updates" },
  { value: "interview_reminders", label: "Interview reminders" },
  { value: "marketing_emails", label: "Marketing emails" },
];

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

function SummaryStat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-white/35 px-3 py-2 dark:bg-white/[0.03]">
      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="m-0 mt-1 font-['Fraunces',serif] text-xl font-extrabold text-[var(--text-heading)]">{value}</p>
      {sub ? <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">{sub}</p> : null}
    </div>
  );
}

export default function EmailMonitoringPage() {
  const [range, setRange] = useState("30d");
  const [status, setStatus] = useState("all");
  const [emailType, setEmailType] = useState("all");
  const [state, setState] = useState({ mode: "loading", error: "" });
  const [data, setData] = useState(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("range", range);
    if (status && status !== "all") p.set("status", status);
    if (emailType && emailType !== "all") p.set("emailType", emailType);
    return p.toString();
  }, [range, status, emailType]);

  const load = () => {
    setState({ mode: "loading", error: "" });
    fetch(`/api/admin/email-monitoring?${qs}`, { credentials: "same-origin" })
      .then(readJson)
      .then((r) => {
        if (!r.ok) {
          const reason =
            r.body?.details && typeof r.body.details === "object" && "reason" in r.body.details
              ? String(r.body.details.reason)
              : "";
          const msg = r.body?.message || r.body?.error || `Failed to load (${r.status})`;
          setState({
            mode: "error",
            error: reason ? `${msg} — ${reason}` : msg,
          });
          setData(null);
          return;
        }
        setData(r.body);
        setState({ mode: "ok", error: "" });
      })
      .catch(() => {
        setState({ mode: "error", error: "Network error" });
        setData(null);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const summary = data?.summary;
  const byType = Array.isArray(data?.byEmailType) ? data.byEmailType : [];
  const failures = Array.isArray(data?.recentFailures) ? data.recentFailures : [];

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="mb-6 max-w-3xl">
        <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-500">
          Admin
        </p>
        <h1 className="m-0 block bg-gradient-to-br from-[var(--text-heading)] to-blue-600 bg-clip-text pb-1 font-['Fraunces',serif] text-2xl font-extrabold leading-tight text-transparent dark:to-blue-400">
          Email monitoring
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Operational view of queued/sent/failed emails and recent failures. Data is backed by `EmailLog`.
        </p>
      </div>

      <Card glass style={{ padding: "18px 20px" }} className="mb-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Range">
            <Select value={range} onChange={setRange} options={RANGE_OPTIONS} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Email type">
            <Select value={emailType} onChange={setEmailType} options={TYPE_OPTIONS} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="ghost" sm onClick={() => load()} disabled={state.mode === "loading"}>
            {state.mode === "loading" ? "Refreshing…" : "Refresh"}
          </Button>
          {state.mode === "ok" && data?.filters ? (
            <span className="text-[11px] text-[var(--text-muted)]">
              From {String(data.filters.from).slice(0, 10)} to {String(data.filters.to).slice(0, 10)}
            </span>
          ) : null}
        </div>
      </Card>

      {state.mode === "error" ? (
        <Card glass className="mb-6" style={{ padding: "14px 16px" }}>
          <div className="text-sm text-red-500">{state.error || "Failed to load"}</div>
        </Card>
      ) : null}

      {summary ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label="Sent" value={summary.emailsSent} sub={`Delivery rate: ${fmtPct(summary.deliveryRate)}`} />
          <SummaryStat label="Failed" value={summary.failedEmails} sub={`Retries: ${summary.retryCount}`} />
          <SummaryStat label="Pending" value={summary.pendingEmails} sub="Queued / retrying" />
          <SummaryStat label="Total" value={summary.totalEmails} sub="Matching filters" />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card glass style={{ padding: "18px 20px" }} className="min-w-0">
          <h2 className="m-0 mb-3 font-['Fraunces',serif] text-lg font-bold text-[var(--text-heading)]">
            By type
          </h2>
          <div className="overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Sent</th>
                  <th className="py-2 pr-3">Failed</th>
                  <th className="py-2 pr-3">Pending</th>
                  <th className="py-2 pr-3">Delivery</th>
                  <th className="py-2 pr-3">Retries</th>
                </tr>
              </thead>
              <tbody>
                {byType.length === 0 ? (
                  <tr>
                    <td className="py-3 text-[var(--text-muted)]" colSpan={6}>
                      No data for selected filters.
                    </td>
                  </tr>
                ) : (
                  byType.map((r) => (
                    <tr key={r.emailType} className="border-t border-[var(--app-border)]">
                      <td className="py-2 pr-3 font-medium">{r.label}</td>
                      <td className="py-2 pr-3">{r.emailsSent}</td>
                      <td className="py-2 pr-3">{r.failedEmails}</td>
                      <td className="py-2 pr-3">{r.pendingEmails}</td>
                      <td className="py-2 pr-3">{fmtPct(r.deliveryRate)}</td>
                      <td className="py-2 pr-3">{r.retryCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card glass style={{ padding: "18px 20px" }} className="min-w-0">
          <h2 className="m-0 mb-3 font-['Fraunces',serif] text-lg font-bold text-[var(--text-heading)]">
            Recent failures
          </h2>
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {failures.length === 0 ? (
                  <tr>
                    <td className="py-3 text-[var(--text-muted)]" colSpan={6}>
                      No recent failures.
                    </td>
                  </tr>
                ) : (
                  failures.map((f) => (
                    <tr key={f.id} className="border-t border-[var(--app-border)]">
                      <td className="py-2 pr-3">{String(f.createdAt).slice(0, 19).replace("T", " ")}</td>
                      <td className="py-2 pr-3">{f.recipient}</td>
                      <td className="py-2 pr-3">{f.template}</td>
                      <td className="py-2 pr-3">{f.subject}</td>
                      <td className="py-2 pr-3">{f.attemptCount}</td>
                      <td className="py-2 pr-3 text-red-500">{f.error || "Unknown error"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

