"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Checks, Tray } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function notificationTargetHref(referenceId, referenceType) {
  if (!referenceId || !referenceType) return null;
  if (referenceType === "application") return `/applicants?applicationId=${encodeURIComponent(referenceId)}`;
  if (referenceType === "candidate") return `/applicants?candidateId=${encodeURIComponent(referenceId)}`;
  return null;
}

const POLL_INTERVAL_IDLE_MS = 10_000;
const POLL_INTERVAL_OPEN_MS = 5_000;
const POLL_INTERVAL_SSE_BACKUP_MS = 60_000;
const SSE_RECONNECT_MS = 5_000;
export const NOTIFICATIONS_REFRESH_EVENT = "recruitment:notifications-refresh";

const TYPE_LABEL = {
  CANDIDATE_CREATED: "New candidate",
  APPLICATION_CREATED: "Application",
  STAGE_CHANGED: "Stage update",
  INTERVIEW_SCHEDULED: "Interview",
  OFFER_SENT: "Offer",
};

function formatTimeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const openRef = useRef(false);
  const sseConnectedRef = useRef(false);
  openRef.current = open;

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { credentials: "same-origin" });
      if (res.ok) {
        const { count } = await res.json();
        setUnreadCount(typeof count === "number" ? count : 0);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchNotifications = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?page=${pageNum}&limit=10`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.notifications) ? data.notifications : [];
        setNotifications(pageNum === 1 ? list : (prev) => [...prev, ...list]);
        setPage(data.page ?? pageNum);
        setTotalPages(data.totalPages ?? 0);
      }
    } catch { setNotifications([]); }
    finally { setLoading(false); }
  }, []);

  const refreshFeed = useCallback(() => {
    void fetchUnreadCount();
    if (openRef.current) void fetchNotifications(1);
  }, [fetchUnreadCount, fetchNotifications]);

  useEffect(() => {
    refreshFeed();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") refreshFeed();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      refreshFeed();
    };

    const getPollInterval = () => {
      if (sseConnectedRef.current) return POLL_INTERVAL_SSE_BACKUP_MS;
      if (openRef.current) return POLL_INTERVAL_OPEN_MS;
      return POLL_INTERVAL_IDLE_MS;
    };

    let pollTimer = setInterval(poll, getPollInterval());

    return () => {
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshFeed, open]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;

    let es = null;
    let reconnectTimer = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      es = new EventSource("/api/notifications/stream");

      es.addEventListener("connected", () => {
        sseConnectedRef.current = true;
      });

      es.addEventListener("notification", () => {
        refreshFeed();
      });

      es.addEventListener("ping", () => {
        /* keep-alive */
      });

      es.onerror = () => {
        sseConnectedRef.current = false;
        es?.close();
        es = null;
        if (!disposed) {
          reconnectTimer = setTimeout(connect, SSE_RECONNECT_MS);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      sseConnectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [refreshFeed]);

  useEffect(() => {
    function onRefresh() {
      refreshFeed();
    }
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [refreshFeed]);

  useEffect(() => {
    if (open) fetchNotifications(1);
  }, [open, fetchNotifications]);

  async function handleMarkRead(id) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "same-origin" });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch { /* ignore */ }
  }

  async function handleNotificationActivate(n) {
    const href = notificationTargetHref(n.referenceId, n.referenceType);
    if (!n.isRead) await handleMarkRead(n.id);
    if (href) { router.push(href); setOpen(false); }
  }

  async function handleMarkAllRead() {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "PATCH", credentials: "same-origin" });
      if (res.ok) { setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true }))); setUnreadCount(0); }
    } catch { /* ignore */ }
  }

  const hasMore = page < totalPages;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 size-4 justify-center rounded-full p-0 text-[10px]"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleMarkAllRead}>
              <Checks className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />

        <ScrollArea className="max-h-95">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Tray className="size-8 opacity-40" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <>
              {notifications.map((n) => {
                const hasLink = Boolean(notificationTargetHref(n.referenceId, n.referenceType));
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (hasLink) void handleNotificationActivate(n);
                      else if (!n.isRead) void handleMarkRead(n.id);
                    }}
                    className={cn(
                      "w-full border-b px-4 py-3 text-left transition-colors last:border-b-0",
                      "hover:bg-muted/50",
                      !n.isRead && "bg-primary/5",
                      hasLink || !n.isRead ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!n.isRead && (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className={cn("min-w-0 flex-1", n.isRead && "pl-4")}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn("text-xs font-medium", !n.isRead && "font-semibold")}>
                            {TYPE_LABEL[n.type] ?? n.type}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                            {formatTimeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <div className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => fetchNotifications(page + 1)}
                    disabled={loading}
                  >
                    {loading ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
