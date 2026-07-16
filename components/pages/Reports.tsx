"use client";

import { T } from "@/lib/helpers";
import BarChart from "@/components/charts/BarChart";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DownloadSimple, ChartBar } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import DashboardDateRangePicker from "@/components/layout/DashboardDateRangePicker";
import {
  isDashboardCompareAvailable,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";
import { reportsExportUrl } from "@/lib/api/dashboard";

interface ReportsProps {
  dateRange: DashboardDateRangeValue;
  onDateRangeChange: (val: DashboardDateRangeValue) => void;
  compareEnabled: boolean;
  onCompareChange?: (val: boolean) => void;
  stageBar: any[];
  deptBar: any[];
  sourceBar: any[];
  overview: any;
  exportAudit?: any[];
  loadState: "loading" | "ok" | "error";
  error?: string;
}

export default function Reports({
  dateRange,
  onDateRangeChange,
  compareEnabled,
  onCompareChange,
  stageBar,
  deptBar,
  sourceBar,
  overview,
  exportAudit,
  loadState,
  error,
}: ReportsProps) {
  const compareAvailable = isDashboardCompareAvailable(dateRange);
  const currentOverview = overview?.currentPeriod ?? overview;
  const change = overview?.percentageChange ?? null;

  return (
    <div
      className="flex flex-col gap-6"
      role="region"
      aria-label="Recruitment Reports"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Analytics
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DashboardDateRangePicker value={dateRange} onChange={onDateRangeChange} />

          <label
            className={cn(
              "flex cursor-pointer items-center gap-1.5 text-xs select-none",
              compareAvailable
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/50 cursor-not-allowed",
            )}
          >
            <input
              type="checkbox"
              checked={compareEnabled && compareAvailable}
              disabled={!compareAvailable}
              onChange={(e) => onCompareChange?.(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Compare
          </label>
        </div>
      </div>

      {/* Export Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <DownloadSimple className="size-4 text-primary" />
            Export Data
          </CardTitle>
          <CardDescription>
            Download application records for the selected date range. Access
            logs will record this action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { format: "csv", label: "CSV" },
              { format: "xlsx", label: "Excel" },
              { format: "pdf", label: "PDF Summary" },
            ].map(({ format, label }) => (
              <Link
                key={format}
                href={reportsExportUrl(dateRange, format)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 text-xs",
                )}
              >
                Download {label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI Section */}
      {loadState === "ok" && currentOverview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <ChartBar className="size-4 text-primary" />
              KPI Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {[
                { key: "totalApplications", label: "Applications" },
                { key: "hiredCount", label: "Hired" },
                { key: "rejectedCount", label: "Rejected" },
                { key: "offerRate", label: "Offer Rate" },
                { key: "conversionRate", label: "Conversion Rate" },
              ].map((k) => (
                <div key={k.key} className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-medium">
                    {k.label}
                  </p>
                  <p className="text-xl font-bold tracking-tight">
                    {k.key.includes("Rate")
                      ? `${Math.round((Number(currentOverview[k.key] ?? 0) || 0) * 100)}%`
                      : (currentOverview[k.key] ?? 0)}
                  </p>
                  {change && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {change[k.key] == null
                        ? "n/a"
                        : `${change[k.key] > 0 ? "+" : ""}${change[k.key]}%`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loadState === "loading" && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Loading analytics reports...
        </div>
      )}

      {loadState === "error" && error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Charts Grid */}
      {loadState === "ok" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* By Stage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                By Stage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BarChart
                data={stageBar}
                valueKey="value"
                labelKey="label"
                color="#60A5FA"
                height={180}
              />
              <div className="space-y-1.5 pt-2 border-t">
                {stageBar.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href || "/applicants"}
                    className="flex justify-between text-xs text-muted-foreground hover:text-primary no-underline"
                  >
                    <span>{s.label}</span>
                    <span className="font-semibold text-foreground">
                      {s.value}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Dept */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                By Department
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={deptBar}
                valueKey="value"
                labelKey="label"
                color="#A78BFA"
                height={180}
              />
            </CardContent>
          </Card>

          {/* By Source */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                By Source
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BarChart
                data={sourceBar}
                valueKey="value"
                labelKey="label"
                color="#34D399"
                height={180}
              />
              <div className="space-y-1.5 pt-2 border-t">
                {sourceBar.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href || "/applicants"}
                    className="flex justify-between text-xs text-muted-foreground hover:text-primary no-underline"
                  >
                    <span>{s.label}</span>
                    <span className="font-semibold text-foreground">
                      {s.value}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Export Audit Log */}
      {loadState === "ok" && exportAudit != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Exports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exportAudit.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No recent export logs.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">When (UTC)</TableHead>
                      <TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">Format</TableHead>
                      <TableHead className="text-xs">Range</TableHead>
                      <TableHead className="text-xs text-right">Rows</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportAudit.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs font-mono py-2.5">
                          {row.createdAt
                            ? new Date(row.createdAt)
                                .toISOString()
                                .replace("T", " ")
                                .slice(0, 19)
                            : "—"}
                        </TableCell>
                        <TableCell
                          className="text-xs py-2.5 max-w-[150px] truncate"
                          title={row.user?.email ?? ""}
                        >
                          {row.user?.email ?? row.userId ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs py-2.5 font-medium">
                          {row.format?.toUpperCase() ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs py-2.5">
                          {row.reportRange ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs py-2.5 text-right font-mono">
                          {row.rowCount ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
