"use client";

import { useState } from "react";

/**
 * Opens Bull Board in a new tab after fetching an ADMIN-signed access URL.
 */
export default function QueueMonitorLink() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUrl, setLastUrl] = useState(null);

  async function openMonitor() {
    setError(null);
    setLastUrl(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/queue-monitor/access", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint = typeof data.hint === "string" ? data.hint : "";
        const base = data.error || `Request failed (${res.status})`;
        setError(hint ? `${base} ${hint}` : base);
        return;
      }
      if (typeof data.url === "string") {
        // Popups are often blocked; fall back to same-tab navigation + show a clickable link.
        setLastUrl(data.url);
        const opened = window.open(data.url, "_blank", "noopener,noreferrer");
        if (!opened) {
          window.location.assign(data.url);
        }
      } else {
        setError("No monitor URL returned");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open queue monitor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => void openMonitor()}
        disabled={loading}
        aria-label="Open queue monitor in a new tab"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border border-transparent px-3 py-2 text-left text-[13px] font-medium text-slate-700 outline-offset-2 transition-all duration-150 hover:bg-slate-100/80 disabled:opacity-60 dark:text-slate-500 dark:hover:bg-white/[0.04]"
      >
        <span className="text-sm">⚙</span>
        {loading ? "Opening monitor…" : "Queue monitor"}
      </button>
      {error ? (
        <p className="m-0 mt-1 px-3 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {lastUrl ? (
        <p className="m-0 mt-1 px-3 text-[11px] text-slate-600 dark:text-slate-400">
          If it didn&apos;t open automatically,{" "}
          <a
            href={lastUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            open the queue monitor
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
