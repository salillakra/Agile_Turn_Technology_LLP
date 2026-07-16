"use client";

import { Gear } from "@phosphor-icons/react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

/**
 * Sidebar item that opens the signed Bull Board Queue Monitor in a new tab via redirect,
 * and includes a small direct link to the raw API access response.
 */
export default function QueueMonitorLink() {
  return (
    <div className="mb-0.5 w-full">
      <SidebarMenuButton
        onClick={() => {
          window.open("/api/admin/queue-monitor/access", "_blank", "noopener,noreferrer");
        }}
        className="text-sidebar-foreground"
        tooltip="Queue monitor"
      >
        <Gear className="size-4 shrink-0" />
        <span>Queue monitor</span>
        <a
          href="/api/admin/queue-monitor/access?json=true"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          API
        </a>
      </SidebarMenuButton>
    </div>
  );
}
