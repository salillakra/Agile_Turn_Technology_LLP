"use client";

import { useState } from "react";
import { Gear, ArrowsClockwise } from "@phosphor-icons/react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

/**
 * Opens Bull Board in a new tab after fetching an ADMIN-signed access URL.
 */
export default function QueueMonitorLink() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

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
        const target =
          typeof data.redisTarget === "string" ? ` (Redis: ${data.redisTarget})` : "";
        setError(hint ? `${base}${target}. ${hint}` : `${base}${target}`);
        return;
      }
      if (typeof data.url === "string") {
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
    <div className="mb-0.5 w-full">
      <SidebarMenuButton
        onClick={() => void openMonitor()}
        disabled={loading}
        className="text-sidebar-foreground"
        tooltip="Queue monitor"
      >
        {loading ? (
          <ArrowsClockwise className="size-4 shrink-0 animate-spin" />
        ) : (
          <Gear className="size-4 shrink-0" />
        )}
        <span>{loading ? "Opening monitor…" : "Queue monitor"}</span>
      </SidebarMenuButton>
      {error && (
        <p className="m-0 mt-1 px-2 text-[10px] text-destructive font-medium leading-normal group-data-[collapsible=icon]:hidden" role="alert">
          {error}
        </p>
      )}
      {lastUrl && (
        <p className="m-0 mt-1 px-2 text-[10px] text-muted-foreground leading-normal group-data-[collapsible=icon]:hidden">
          If it didn&apos;t open automatically,{" "}
          <a
            href={lastUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            open queue monitor
          </a>
          .
        </p>
      )}
    </div>
  );
}
