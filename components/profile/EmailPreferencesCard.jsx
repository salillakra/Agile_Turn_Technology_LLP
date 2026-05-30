"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[var(--app-border)] bg-white/40 p-3 dark:bg-white/[0.03]">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-heading)]">{label}</span>
        <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">{description}</span>
      </span>
      <span className="shrink-0 pt-0.5">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </span>
    </label>
  );
}

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export default function EmailPreferencesCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [prefs, setPrefs] = useState(null);
  const [draft, setDraft] = useState({
    stageUpdates: true,
    interviewReminders: true,
    marketingEmails: false,
  });

  const dirty = useMemo(() => {
    if (!prefs) return false;
    return (
      Boolean(draft.stageUpdates) !== Boolean(prefs.stageUpdates) ||
      Boolean(draft.interviewReminders) !== Boolean(prefs.interviewReminders) ||
      Boolean(draft.marketingEmails) !== Boolean(prefs.marketingEmails)
    );
  }, [draft, prefs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    setOk("");
    fetch("/api/me/email-preferences", { credentials: "same-origin" })
      .then(readJson)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          const msg = r.body?.message || r.body?.error || `Failed to load email preferences (${r.status})`;
          setErr(msg);
          setLoading(false);
          return;
        }
        setPrefs(r.body);
        setDraft({
          stageUpdates: Boolean(r.body.stageUpdates),
          interviewReminders: Boolean(r.body.interviewReminders),
          marketingEmails: Boolean(r.body.marketingEmails),
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Network error while loading email preferences.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setErr("");
    setOk("");
    setSaving(true);
    try {
      const res = await fetch("/api/me/email-preferences", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageUpdates: Boolean(draft.stageUpdates),
          interviewReminders: Boolean(draft.interviewReminders),
          marketingEmails: Boolean(draft.marketingEmails),
        }),
      });
      const r = await readJson(res);
      if (!r.ok) {
        const msg = r.body?.message || r.body?.error || `Save failed (${r.status})`;
        throw new Error(msg);
      }
      setPrefs(r.body);
      setDraft({
        stageUpdates: Boolean(r.body.stageUpdates),
        interviewReminders: Boolean(r.body.interviewReminders),
        marketingEmails: Boolean(r.body.marketingEmails),
      });
      setOk("Email preferences saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card glass style={{ padding: "22px 26px" }} className="relative overflow-hidden">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-blue-500/5 blur-2xl dark:bg-blue-400/10" aria-hidden />
      <div className="relative">
        <h2 className="mt-0 mb-1 font-['Fraunces',serif] text-lg font-bold text-[var(--text-heading)]">
          Email preferences
        </h2>
        <p className="m-0 mb-4 text-sm leading-relaxed text-[var(--text-muted)]">
          Control which optional emails you receive. Transactional emails (password reset, account security) may still be sent when required.
        </p>

        {err ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-sm text-red-600 backdrop-blur-sm dark:text-red-300"
          >
            {err}
          </div>
        ) : null}
        {ok ? (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-sm text-emerald-700 backdrop-blur-sm dark:text-emerald-300">
            {ok}
          </div>
        ) : null}

        <div className="grid gap-3">
          <ToggleRow
            label="Stage updates"
            description="Updates about your candidates moving through stages (where applicable)."
            checked={draft.stageUpdates}
            onChange={(v) => setDraft((d) => ({ ...d, stageUpdates: v }))}
            disabled={loading || saving}
          />
          <ToggleRow
            label="Interview reminders"
            description="Reminders for upcoming interviews (candidate + interviewer notifications)."
            checked={draft.interviewReminders}
            onChange={(v) => setDraft((d) => ({ ...d, interviewReminders: v }))}
            disabled={loading || saving}
          />
          <ToggleRow
            label="Marketing emails"
            description="Product updates and non-critical announcements. Off by default."
            checked={draft.marketingEmails}
            onChange={(v) => setDraft((d) => ({ ...d, marketingEmails: v }))}
            disabled={loading || saving}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={loading || saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save preferences" : "Saved"}
          </Button>
          {loading ? <span className="text-xs text-[var(--text-muted)]">Loading…</span> : null}
        </div>
      </div>
    </Card>
  );
}

