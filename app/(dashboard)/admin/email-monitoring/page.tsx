"use client";

import { useState } from "react";
import { useEmailMonitoring } from "@/hooks/queries/useEmailMonitoring";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SpinnerGap, ArrowsClockwise } from "@phosphor-icons/react";
import DashboardDateRangePicker from "@/components/layout/DashboardDateRangePicker";
import {
  defaultDashboardDateRange,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";

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

function fmtPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

function SummaryStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-extrabold text-foreground">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function EmailMonitoringPage() {
  const [dateRange, setDateRange] = useState<DashboardDateRangeValue>(defaultDashboardDateRange);
  const [status, setStatus] = useState("all");
  const [emailType, setEmailType] = useState("all");

  const { data, isLoading, isError, error, refetch, isFetching } = useEmailMonitoring({
    range: dateRange,
    status,
    emailType,
  });

  const summary = data?.summary;
  const byType = Array.isArray(data?.byEmailType) ? data.byEmailType : [];
  const failures = Array.isArray(data?.recentFailures) ? data.recentFailures : [];

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary mb-1 uppercase tracking-wider">Admin</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Email Monitoring</h1>
        <p className="text-muted-foreground mt-2">
          Operational view of queued, sent, and failed emails.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Range</Label>
              <DashboardDateRangePicker value={dateRange} onChange={setDateRange} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email type</Label>
              <Select value={emailType} onValueChange={setEmailType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select email type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <SpinnerGap className="size-4 mr-2 animate-spin" /> : <ArrowsClockwise className="size-4 mr-2" />}
              Refresh
            </Button>
            {data?.filters ? (
              <span className="text-xs text-muted-foreground">
                From {String(data.filters.from).slice(0, 10)} to {String(data.filters.to).slice(0, 10)}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load"}
          </CardContent>
        </Card>
      ) : null}

      {isLoading && !data ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
          <SpinnerGap className="size-8 animate-spin mb-4" />
          <p>Loading email logs...</p>
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryStat label="Sent" value={summary.emailsSent} sub={`Delivery rate: ${fmtPct(summary.deliveryRate)}`} />
          <SummaryStat label="Failed" value={summary.failedEmails} sub={`Retries: ${summary.retryCount}`} />
          <SummaryStat label="Pending" value={summary.pendingEmails} sub="Queued / retrying" />
          <SummaryStat label="Total" value={summary.totalEmails} sub="Matching filters" />
        </div>
      ) : null}

      {!isLoading && data && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                      <th className="py-3 pr-3 font-medium">Type</th>
                      <th className="py-3 pr-3 font-medium">Sent</th>
                      <th className="py-3 pr-3 font-medium">Failed</th>
                      <th className="py-3 pr-3 font-medium">Pending</th>
                      <th className="py-3 pr-3 font-medium">Delivery</th>
                      <th className="py-3 pr-3 font-medium">Retries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byType.length === 0 ? (
                      <tr>
                        <td className="py-4 text-muted-foreground text-center" colSpan={6}>
                          No data for selected filters.
                        </td>
                      </tr>
                    ) : (
                      byType.map((r: any) => (
                        <tr key={r.emailType} className="border-b last:border-0">
                          <td className="py-3 pr-3 font-medium">{r.label}</td>
                          <td className="py-3 pr-3">{r.emailsSent}</td>
                          <td className="py-3 pr-3">{r.failedEmails}</td>
                          <td className="py-3 pr-3">{r.pendingEmails}</td>
                          <td className="py-3 pr-3">{fmtPct(r.deliveryRate)}</td>
                          <td className="py-3 pr-3">{r.retryCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Failures</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                      <th className="py-3 pr-3 font-medium">When</th>
                      <th className="py-3 pr-3 font-medium">Recipient</th>
                      <th className="py-3 pr-3 font-medium">Template</th>
                      <th className="py-3 pr-3 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.length === 0 ? (
                      <tr>
                        <td className="py-4 text-muted-foreground text-center" colSpan={4}>
                          No recent failures.
                        </td>
                      </tr>
                    ) : (
                      failures.map((f: any) => (
                        <tr key={f.id} className="border-b last:border-0">
                          <td className="py-3 pr-3">{String(f.createdAt).slice(0, 16).replace("T", " ")}</td>
                          <td className="py-3 pr-3">{f.recipient}</td>
                          <td className="py-3 pr-3">{f.template}</td>
                          <td className="py-3 pr-3 text-destructive max-w-[200px] truncate" title={f.error || "Unknown error"}>
                            {f.error || "Unknown error"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
