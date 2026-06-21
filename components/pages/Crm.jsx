"use client";

import { useCallback, useEffect, useState } from "react";
import { T } from "@/lib/helpers";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Field from "@/components/ui/Field";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "leads", label: "Leads" },
  { id: "clients", label: "Clients" },
  { id: "requirements", label: "Requirements" },
  { id: "invoices", label: "Invoices" },
];

async function readJson(res) {
  return res.json().catch(() => ({}));
}

export default function Crm() {
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [leadForm, setLeadForm] = useState({ companyName: "", contactName: "", email: "", phone: "" });
  const [clientForm, setClientForm] = useState({ name: "", industry: "", billingEmail: "" });
  const [reqForm, setReqForm] = useState({
    clientId: "",
    title: "",
    feeAmount: "",
    department: "",
    location: "",
  });

  const refresh = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      const [sumRes, leadRes, clientRes, reqRes, invRes] = await Promise.all([
        fetch("/api/crm/revenue/summary", { credentials: "same-origin" }),
        fetch("/api/crm/leads?limit=50", { credentials: "same-origin" }),
        fetch("/api/crm/clients?limit=50", { credentials: "same-origin" }),
        fetch("/api/crm/requirements?limit=50", { credentials: "same-origin" }),
        fetch("/api/crm/invoices?limit=50", { credentials: "same-origin" }),
      ]);
      const [sum, leadBody, clientBody, reqBody, invBody] = await Promise.all([
        readJson(sumRes),
        readJson(leadRes),
        readJson(clientRes),
        readJson(reqRes),
        readJson(invRes),
      ]);
      if (!sumRes.ok) throw new Error(sum?.message || sum?.error || "Failed to load CRM summary");
      setSummary(sum);
      setLeads(leadBody?.data ?? []);
      setClients(clientBody?.data ?? []);
      setRequirements(reqBody?.data ?? []);
      setInvoices(invBody?.data ?? []);
      setLoadState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CRM");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createLead() {
    setMsg("");
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadForm),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body?.message || body?.error || "Create lead failed");
      return;
    }
    setLeadForm({ companyName: "", contactName: "", email: "", phone: "" });
    setMsg("Lead created.");
    void refresh();
  }

  async function convertLead(leadId) {
    setMsg("");
    const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/convert`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body?.message || body?.error || "Convert failed");
      return;
    }
    setMsg(`Lead converted to client "${body.name}".`);
    void refresh();
  }

  async function createClient() {
    setMsg("");
    const res = await fetch("/api/crm/clients", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientForm),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body?.message || body?.error || "Create client failed");
      return;
    }
    setClientForm({ name: "", industry: "", billingEmail: "" });
    setMsg("Client created.");
    void refresh();
  }

  async function createRequirement() {
    setMsg("");
    const res = await fetch("/api/crm/requirements", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...reqForm,
        feeAmount: reqForm.feeAmount ? Number(reqForm.feeAmount) : null,
      }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body?.message || body?.error || "Create requirement failed");
      return;
    }
    setReqForm({ clientId: "", title: "", feeAmount: "", department: "", location: "" });
    setMsg("Requirement created.");
    void refresh();
  }

  async function activateRequirement(requirementId) {
    setMsg("");
    const res = await fetch(`/api/crm/requirements/${encodeURIComponent(requirementId)}/activate`, {
      method: "POST",
      credentials: "same-origin",
    });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body?.message || body?.error || "Activate failed");
      return;
    }
    setMsg(`Requirement activated — Job ${body.jobId ?? body.job?.id ?? ""} created.`);
    void refresh();
  }

  async function markInvoicePaid(invoiceId) {
    setMsg("");
    const res = await fetch(`/api/crm/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body?.message || body?.error || "Update invoice failed");
      return;
    }
    setMsg("Invoice marked paid.");
    void refresh();
  }

  return (
    <div role="region" aria-label="Recruitment CRM">
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...T.mono, margin: "0 0 4px", color: "#3B82F6", textTransform: "uppercase", letterSpacing: ".1em" }}>
          CRM
        </p>
        <h1 style={T.h1}>Recruitment CRM</h1>
        <p style={{ ...T.mono, fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
          Lead → Client → Requirement → Submission → Closure → Invoice
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "primary" : "ghost"}
            sm
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {msg ? (
        <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-300" style={T.mono}>
          {msg}
        </p>
      ) : null}

      {loadState === "loading" ? <p style={T.mono}>Loading CRM…</p> : null}

      {tab === "overview" && summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Active leads", value: summary.leadCount },
            { label: "Active clients", value: summary.clientCount },
            { label: "Open requirements", value: summary.openRequirements },
            { label: "Closures", value: summary.closureCount },
            { label: "Revenue paid", value: summary.revenuePaid?.total ?? 0 },
            { label: "Outstanding", value: summary.revenueOutstanding?.total ?? 0 },
          ].map((kpi) => (
            <Card key={kpi.label} glass style={{ padding: "16px 18px" }}>
              <p style={{ ...T.mono, fontSize: 10, color: "var(--text-muted)", margin: 0 }}>{kpi.label}</p>
              <p style={{ ...T.h2, margin: "6px 0 0" }}>{kpi.value}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "leads" ? (
        <div className="space-y-4">
          <Card glass style={{ padding: "16px 18px" }}>
            <p style={{ ...T.h3, marginBottom: 12 }}>New lead</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Company">
                <Input value={leadForm.companyName} onChange={(e) => setLeadForm((p) => ({ ...p, companyName: e.target.value }))} />
              </Field>
              <Field label="Contact">
                <Input value={leadForm.contactName} onChange={(e) => setLeadForm((p) => ({ ...p, contactName: e.target.value }))} />
              </Field>
              <Field label="Email">
                <Input value={leadForm.email} onChange={(e) => setLeadForm((p) => ({ ...p, email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <Input value={leadForm.phone} onChange={(e) => setLeadForm((p) => ({ ...p, phone: e.target.value }))} />
              </Field>
            </div>
            <div className="mt-3">
              <Button onClick={() => void createLead()}>Add lead</Button>
            </div>
          </Card>
          <Card glass style={{ padding: "16px 18px" }}>
            <p style={{ ...T.h3, marginBottom: 12 }}>Leads</p>
            <div className="space-y-2">
              {leads.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2">
                  <div>
                    <p className="m-0 font-semibold text-[var(--text-heading)]">{l.companyName}</p>
                    <p className="m-0 text-xs text-[var(--text-muted)]" style={T.mono}>
                      {l.contactName} · {l.status}
                    </p>
                  </div>
                  {l.status !== "CONVERTED" ? (
                    <Button sm variant="ghost" onClick={() => void convertLead(l.id)}>
                      Convert to client
                    </Button>
                  ) : (
                    <span className="text-xs text-emerald-600">Converted</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "clients" ? (
        <div className="space-y-4">
          <Card glass style={{ padding: "16px 18px" }}>
            <p style={{ ...T.h3, marginBottom: 12 }}>New client</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Name">
                <Input value={clientForm.name} onChange={(e) => setClientForm((p) => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="Industry">
                <Input value={clientForm.industry} onChange={(e) => setClientForm((p) => ({ ...p, industry: e.target.value }))} />
              </Field>
              <Field label="Billing email">
                <Input value={clientForm.billingEmail} onChange={(e) => setClientForm((p) => ({ ...p, billingEmail: e.target.value }))} />
              </Field>
            </div>
            <div className="mt-3">
              <Button onClick={() => void createClient()}>Add client</Button>
            </div>
          </Card>
          <Card glass style={{ padding: "16px 18px" }}>
            {clients.map((c) => (
              <div key={c.id} className="mb-2 rounded-lg border border-[var(--app-border)] px-3 py-2">
                <p className="m-0 font-semibold">{c.name}</p>
                <p className="m-0 text-xs text-[var(--text-muted)]" style={T.mono}>
                  {c.status} · {c._count?.requirements ?? 0} requirements · {c._count?.contacts ?? 0} contacts
                </p>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {tab === "requirements" ? (
        <div className="space-y-4">
          <Card glass style={{ padding: "16px 18px" }}>
            <p style={{ ...T.h3, marginBottom: 12 }}>New requirement</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Client">
                <select
                  className="w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                  value={reqForm.clientId}
                  onChange={(e) => setReqForm((p) => ({ ...p, clientId: e.target.value }))}
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <Input value={reqForm.title} onChange={(e) => setReqForm((p) => ({ ...p, title: e.target.value }))} />
              </Field>
              <Field label="Fee amount">
                <Input value={reqForm.feeAmount} onChange={(e) => setReqForm((p) => ({ ...p, feeAmount: e.target.value }))} />
              </Field>
              <Field label="Department">
                <Input value={reqForm.department} onChange={(e) => setReqForm((p) => ({ ...p, department: e.target.value }))} />
              </Field>
            </div>
            <div className="mt-3">
              <Button onClick={() => void createRequirement()}>Add requirement</Button>
            </div>
          </Card>
          <Card glass style={{ padding: "16px 18px" }}>
            {requirements.map((r) => (
              <div key={r.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2">
                <div>
                  <p className="m-0 font-semibold">{r.title}</p>
                  <p className="m-0 text-xs text-[var(--text-muted)]" style={T.mono}>
                    {r.client?.name} · {r.status}
                    {r.job ? ` · Job ${r.job.title}` : ""}
                  </p>
                </div>
                {!r.jobId && r.status !== "FILLED" ? (
                  <Button sm onClick={() => void activateRequirement(r.id)}>
                    Activate → create Job
                  </Button>
                ) : null}
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {tab === "invoices" ? (
        <Card glass style={{ padding: "16px 18px" }}>
          {invoices.map((inv) => (
            <div key={inv.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2">
              <div>
                <p className="m-0 font-semibold">{inv.invoiceNumber}</p>
                <p className="m-0 text-xs text-[var(--text-muted)]" style={T.mono}>
                  {inv.client?.name} · {inv.currency} {Number(inv.amount)} · {inv.status}
                </p>
              </div>
              {inv.status !== "PAID" ? (
                <Button sm variant="ghost" onClick={() => void markInvoicePaid(inv.id)}>
                  Mark paid
                </Button>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
