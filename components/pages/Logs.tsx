"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwise,
  MagnifyingGlass,
  SpinnerGap,
} from "@phosphor-icons/react";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  formatActivityAction,
  formatActivitySummary,
  formatActivityTimestamp,
  getActivityActorName,
  getActivityBadgeStyle,
} from "@/lib/activity-log-ui";
import {
  useActivityLogs,
  useInvalidateActivityLogs,
} from "@/hooks/queries/useActivityLogs";
import type { ActivityLogItem } from "@/lib/api/activity-logs";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function LogRow({ log }: { log: ActivityLogItem }) {
  const actor = getActivityActorName(log);
  const initial = actor.charAt(0).toUpperCase();
  const { absolute, relative } = formatActivityTimestamp(log.createdAt);
  const badgeStyle = getActivityBadgeStyle(log.action);
  const summary = formatActivitySummary(log);

  return (
    <TableRow>
      <TableCell className="align-top whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs tabular-nums text-foreground">{relative}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{absolute}</span>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-medium">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{actor}</p>
            {log.user?.email ? (
              <p className="truncate text-[11px] text-muted-foreground">{log.user.email}</p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <Badge
          variant="secondary"
          className="rounded-full border-0 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
          style={badgeStyle}
        >
          {formatActivityAction(log.action)}
        </Badge>
      </TableCell>
      <TableCell className="max-w-xs align-top">
        <p className="truncate text-sm text-muted-foreground" title={summary}>
          {summary}
        </p>
      </TableCell>
      <TableCell className="align-top text-right">
        {log.applicationId ? (
          <Link
            href={`/applicants?highlight=${encodeURIComponent(log.applicationId)}`}
            className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            {log.applicationId.slice(0, 8)}…
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function Logs() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const logsQuery = useActivityLogs(PAGE_SIZE);
  const invalidateLogs = useInvalidateActivityLogs();

  const allLogs = useMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.activity) ?? [],
    [logsQuery.data]
  );

  const actionOptions = useMemo(() => {
    const actions = new Set(allLogs.map((log) => log.action));
    return Array.from(actions).sort();
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLogs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!q) return true;
      const haystack = [
        getActivityActorName(log),
        log.user?.email ?? "",
        log.action,
        formatActivityAction(log.action),
        formatActivitySummary(log),
        log.applicationId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allLogs, search, actionFilter]);

  const isLoading = logsQuery.isLoading;
  const isError = logsQuery.isError;
  const errorMsg = logsQuery.error instanceof Error ? logsQuery.error.message : "Failed to load logs.";

  return (
    <div role="region" aria-label="Activity logs" aria-busy={isLoading}>
      <PageHeader
        eyebrow="Audit trail"
        title="Activity logs"
        description="Recruitment events across applications, interviews, email, and AI workflows."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void invalidateLogs()}
            disabled={logsQuery.isFetching}
          >
            {logsQuery.isFetching ? (
              <SpinnerGap data-icon="inline-start" className="animate-spin" />
            ) : (
              <ArrowsClockwise data-icon="inline-start" />
            )}
            Refresh
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actor, action, or summary…"
                className="pl-9"
                aria-label="Search activity logs"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[220px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {formatActivityAction(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isError ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No activity logs found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {allLogs.length === 0
                  ? "Events will appear here as your team works in the suite."
                  : "Try adjusting your search or action filter."}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Time</TableHead>
                    <TableHead className="w-[220px]">Actor</TableHead>
                    <TableHead className="w-[180px]">Action</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-[120px] text-right">Application</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </TableBody>
              </Table>

              {logsQuery.hasNextPage && actionFilter === "all" && !search.trim() ? (
                <div className="flex justify-center border-t border-border pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void logsQuery.fetchNextPage()}
                    disabled={logsQuery.isFetchingNextPage}
                  >
                    {logsQuery.isFetchingNextPage ? (
                      <SpinnerGap data-icon="inline-start" className="animate-spin" />
                    ) : null}
                    {logsQuery.isFetchingNextPage ? "Loading…" : "Load older entries"}
                  </Button>
                </div>
              ) : null}

              <p
                className={cn(
                  "text-center text-[11px] text-muted-foreground",
                  logsQuery.hasNextPage && actionFilter === "all" && !search.trim()
                    ? "pt-1"
                    : "border-t border-border pt-4"
                )}
              >
                Showing {filteredLogs.length} of {allLogs.length} loaded entries
                {logsQuery.hasNextPage ? " · more available" : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
