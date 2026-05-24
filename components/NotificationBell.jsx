"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/helpers";

/** Build `/applicants` deep link from API `referenceId` + `referenceType` (see `notification-reference-api.ts`). */
function notificationTargetHref(referenceId, referenceType) {
  if (!referenceId || !referenceType) return null;
  if (referenceType === "application") {
    return `/applicants?applicationId=${encodeURIComponent(referenceId)}`;
  }
  if (referenceType === "candidate") {
    return `/applicants?candidateId=${encodeURIComponent(referenceId)}`;
  }
  return null;
}

const POLL_INTERVAL_MS = 30_000;
/** Dispatched after mutations that create notifications (e.g. add applicant) so the badge updates without waiting for poll. */
export const NOTIFICATIONS_REFRESH_EVENT = "recruitment:notifications-refresh";

const TYPE_ICON = {
  CANDIDATE_CREATED: "👤",
  APPLICATION_CREATED: "📝",
  STAGE_CHANGED: "🔄",
  INTERVIEW_SCHEDULED: "📅",
  OFFER_SENT: "🎉",
};

function formatTimeAgo(iso) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const containerRef = useRef(null);
  const openRef = useRef(false);
  openRef.current = open;

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { credentials: "same-origin" });
      if (res.ok) {
        const { count } = await res.json();
        setUnreadCount(typeof count === "number" ? count : 0);
      }
    } catch {
      // ignore
    }
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
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const t = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchUnreadCount]);

  useEffect(() => {
    function onServerSideRefresh() {
      void fetchUnreadCount();
      if (openRef.current) void fetchNotifications(1);
    }
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onServerSideRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onServerSideRefresh);
  }, [fetchUnreadCount, fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications(1);
  }, [open, fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("click", handleClickOutside, true);
      return () => document.removeEventListener("click", handleClickOutside, true);
    }
  }, [open]);

  async function handleMarkRead(id) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "same-origin",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // ignore
    }
  }

  async function handleNotificationActivate(n) {
    const href = notificationTargetHref(n.referenceId, n.referenceType);
    if (!n.isRead) {
      await handleMarkRead(n.id);
    }
    if (href) {
      router.push(href);
      setOpen(false);
    }
  }

  async function handleMarkAllRead() {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "PATCH",
        credentials: "same-origin",
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    }
  }

  const hasMore = page < totalPages;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--app-border)] text-lg text-[var(--text-body)] transition-all duration-200 ${
          open ? "bg-blue-500/10 dark:bg-blue-500/10" : "bg-slate-100/50 dark:bg-white/[0.04]"
        } cursor-pointer hover:bg-slate-200/80 dark:hover:bg-white/[0.08]`}
      >
        🔔
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-full z-[1000] mt-2 flex max-h-[420px] w-[380px] flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-colors duration-200 dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3.5">
            <span style={{ ...T.h3, margin: 0 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="cursor-pointer border-none bg-transparent p-1 text-xs font-semibold text-blue-600 dark:text-blue-400"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[340px] min-h-[200px] flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="p-6 text-center text-[var(--text-muted)]" style={T.mono}>
                Loading…
              </p>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-[var(--text-muted)]" style={T.mono}>
                No notifications
              </p>
            ) : (
              <>
                {notifications.map((n) => {
                  const hasLink = Boolean(notificationTargetHref(n.referenceId, n.referenceType));
                  return (
                  <div
                    key={n.id}
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => {
                      if (hasLink) void handleNotificationActivate(n);
                      else if (!n.isRead) void handleMarkRead(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (hasLink) void handleNotificationActivate(n);
                        else if (!n.isRead) void handleMarkRead(n.id);
                      }
                    }}
                    className={`border-b border-[var(--app-border)] px-4 py-3 transition-colors duration-200 last:border-b-0 ${
                      n.isRead ? "bg-transparent" : "bg-blue-500/[0.06] dark:bg-blue-500/[0.04]"
                    } ${hasLink || !n.isRead ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="flex gap-2.5">
                      <span className="shrink-0 text-sm" aria-hidden>
                        {TYPE_ICON[n.type] ?? "•"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`min-w-0 flex-1 text-[13px] ${
                              n.isRead ? "font-medium text-[var(--text-muted)]" : "font-semibold text-[var(--text-heading-soft)]"
                            }`}
                            style={{ fontFamily: T.body.fontFamily }}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-[var(--text-muted)]" style={T.mono}>
                            {formatTimeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p
                          className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--text-body)]"
                          style={{
                            margin: "4px 0 0",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {n.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
                })}
                {hasMore && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => fetchNotifications(page + 1)}
                      disabled={loading}
                      className="cursor-pointer rounded-lg border border-[var(--app-border)] bg-slate-50 px-4 py-2 text-xs text-[var(--text-body)] transition-colors disabled:cursor-wait dark:bg-white/[0.04]"
                    >
                      {loading ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
