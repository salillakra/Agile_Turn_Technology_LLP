"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwise, TrendUp, Users, Briefcase, GitMerge, Percent, Clock, SpinnerGap,
} from "@phosphor-icons/react";
import { STAGES, STAGE_META, STAGE_LABEL_TO_API } from "@/data/mockData";
import { APPLICATION_STAGE_TO_UI_LABEL, CANDIDATE_SOURCE_TO_UI_LABEL } from "@/src/lib/applications-drilldown-ui";
import BarChart from "@/components/charts/BarChart";
import DonutChart from "@/components/charts/DonutChart";
import LineSparkline from "@/components/charts/LineSparkline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/layout/PageHeader";
import DashboardDateRangePicker from "@/components/layout/DashboardDateRangePicker";
import { getChartColor } from "@/lib/theme";
import {
  defaultDashboardDateRange,
  isDashboardCompareAvailable,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";
import {
  useDashboardSummary,
  useDashboardCharts,
  dashboardKeys,
} from "@/hooks/queries/useDashboard";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function sparkFromNumber(v: number): number[] {
  const n = typeof v === "number" && !Number.isNaN(v) ? Math.max(0, v) : 0;
  if (n === 0) return [0, 0, 0, 0, 0, 0];
  return [n * 0.45, n * 0.58, n * 0.68, n * 0.78, n * 0.9, n].map((x) => Math.round(x * 10) / 10);
}

function sparkFromMonthlyTrend(trend: { count: number }[], fallback: number[]): number[] {
  if (!Array.isArray(trend) || trend.length === 0) return fallback;
  const counts = trend.map((t) => (typeof t.count === "number" ? t.count : 0));
  const last6 = counts.slice(-6);
  const out = [...last6];
  while (out.length < 6) out.unshift(0);
  return out;
}

function formatDeltaPct(pct?: number | null): string | null {
  if (pct == null || typeof pct !== "number" || Number.isNaN(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}% vs prev`;
}

function sourceLabel(apiKey: string): string {
  if (apiKey === "UNKNOWN" || apiKey == null) return "Unknown";
  return (CANDIDATE_SOURCE_TO_UI_LABEL as Record<string, string>)[apiKey] ?? String(apiKey);
}

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Open roles": Briefcase,
  "Applications": Users,
  "Active pipeline": GitMerge,
  "Hired": TrendUp,
  "Offer rate": Percent,
  "Avg. time to hire": Clock,
};

interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  sparkline: number[];
}

function KpiCard({ label, value, sub, color, sparkline }: KpiCardProps) {
  const Icon = KPI_ICONS[label] ?? TrendUp;
  const delta = sub?.includes("%") ? sub : null;
  const isPositive = delta?.startsWith("+");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-1 pt-4 px-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <div className="rounded-md border border-border bg-muted/60 p-1.5">
          <Icon className="text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-2xl font-medium tabular-nums text-foreground">{value}</p>
            {sub ? (
              <p
                className={cn(
                  "mt-0.5 text-[11px] text-muted-foreground",
                  delta && (isPositive ? "text-chart-5" : "text-destructive")
                )}
              >
                {sub}
              </p>
            ) : null}
          </div>
          <LineSparkline values={sparkline} color={color ?? "var(--foreground)"} aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DashboardDateRangeValue>(defaultDashboardDateRange);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const queryClient = useQueryClient();

  const compareActive = compareEnabled && isDashboardCompareAvailable(dateRange);
  const summaryQuery = useDashboardSummary(dateRange, compareActive);
  const chartsQuery = useDashboardCharts(dateRange);

  const summary = summaryQuery.data;
  const charts = chartsQuery.data;
  const isLoading = summaryQuery.isLoading || chartsQuery.isLoading;
  const isError = summaryQuery.isError || chartsQuery.isError;
  const errorMsg = summaryQuery.error?.message || chartsQuery.error?.message;

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  }

  const stageDistribution = charts?.stageDistribution ?? [];
  const sourceDistribution = charts?.sourceDistribution ?? [];
  const departmentDistribution = charts?.departmentDistribution ?? [];
  const monthlyTrend = charts?.monthlyTrend ?? [];

  const stageByLabel = new Map<string, typeof stageDistribution[0]>();
  for (const row of stageDistribution) {
    stageByLabel.set((APPLICATION_STAGE_TO_UI_LABEL as Record<string, string>)[row.stage] ?? row.stage, row);
  }

  const totalApplications = summary?.totalApplications ?? 0;
  const offerRatePct = summary?.offerRate != null ? Math.round(Number(summary.offerRate) * 100) : 0;
  const avgHireDays = summary?.averageTimeToHire != null ? Math.round(Number(summary.averageTimeToHire) * 10) / 10 : 0;
  const appsSpark = sparkFromMonthlyTrend(monthlyTrend as { count: number }[], sparkFromNumber(summary?.totalApplications ?? 0));

  const kpis = summary && !isLoading ? [
    { label: "Open roles", value: summary.openJobs ?? 0, sub: `${summary.totalJobs ?? 0} total jobs`, color: getChartColor(0), sparkline: sparkFromNumber(summary.openJobs ?? 0) },
    { label: "Applications", value: summary.totalApplications ?? 0, sub: [summary.totalCandidates ? `${summary.totalCandidates} unique` : "", formatDeltaPct(summary.totalApplicationsChangePercent)].filter(Boolean).join(" · "), color: getChartColor(1), sparkline: appsSpark },
    { label: "Active pipeline", value: summary.activePipelineCount ?? 0, sub: formatDeltaPct(summary.activePipelineCountChangePercent) ?? undefined, color: getChartColor(2), sparkline: sparkFromNumber(summary.activePipelineCount ?? 0) },
    { label: "Hired", value: summary.hiredCount ?? 0, sub: formatDeltaPct(summary.hiredCountChangePercent) ?? undefined, color: getChartColor(4), sparkline: sparkFromNumber(summary.hiredCount ?? 0) },
    { label: "Offer rate", value: `${offerRatePct}%`, sub: formatDeltaPct(summary.offerRateChangePercent) ?? undefined, color: getChartColor(3), sparkline: sparkFromNumber(offerRatePct) },
    { label: "Avg. time to hire", value: `${avgHireDays}d`, sub: formatDeltaPct(summary.averageTimeToHireChangePercent) ?? undefined, color: getChartColor(5), sparkline: sparkFromNumber(avgHireDays) },
  ] : [];

  const funnelRows = STAGES.map((label) => {
    const row = stageByLabel.get(label);
    const n = row?.count ?? 0;
    const pct = totalApplications > 0 ? (n / totalApplications) * 100 : 0;
    const m = STAGE_META[label];
    const stageApi = (STAGE_LABEL_TO_API as Record<string, string>)[label];
    const href = (row as { applicantsDrillDownHref?: string } | undefined)?.applicantsDrillDownHref ?? (stageApi ? `/applicants?stage=${encodeURIComponent(stageApi)}` : "/applicants");
    return { label, n, pct, m, href };
  });

  const donutData = sourceDistribution.filter((s) => s.count > 0).map((s, i) => ({
    label: sourceLabel(s.source).slice(0, 12),
    value: s.count,
    color: getChartColor(i),
  }));

  const sourceLinks = sourceDistribution.filter((s) => s.count > 0).map((s, i) => ({
    label: sourceLabel(s.source), count: s.count, color: getChartColor(i),
    href: (s as { applicantsDrillDownHref?: string }).applicantsDrillDownHref || "/applicants",
  }));

  const deptBar = departmentDistribution.map((d) => ({
    label: d.department.length > 10 ? `${d.department.slice(0, 10)}…` : d.department,
    value: d.count,
  }));

  return (
    <div role="region" aria-label="Dashboard" aria-busy={isLoading}>
      <PageHeader
        eyebrow="Recruitment operations"
        title="Command center"
        actions={
          <>
            <DashboardDateRangePicker
              value={dateRange}
              onChange={(next) => {
                setDateRange(next);
                if (!isDashboardCompareAvailable(next)) setCompareEnabled(false);
              }}
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={compareActive}
                disabled={!isDashboardCompareAvailable(dateRange)}
                onChange={(e) => setCompareEnabled(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Compare period
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? (
                <SpinnerGap className="animate-spin" />
              ) : (
                <ArrowsClockwise />
              )}
              Refresh
            </Button>
          </>
        }
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-52 rounded-xl" />
            <Skeleton className="h-52 rounded-xl" />
          </div>
        </div>
      )}

      {/* Error */}
      {isError && errorMsg && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {!isLoading && !isError && summary && charts && (
        <div className="flex flex-col gap-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
          </div>

          {/* Pipeline + Source */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pipeline Funnel</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {funnelRows.map(({ label, n, pct, m, href }) => (
                  <Link key={label} href={href} className="group flex items-center gap-3 no-underline">
                    <span className="w-24 shrink-0 text-[11px] text-muted-foreground truncate">{label}</span>
                    <Progress
                      value={pct}
                      className="h-1.5 flex-1"
                      style={{ "--progress-bg": m?.color ?? "hsl(var(--primary))" } as React.CSSProperties}
                    />
                    <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: m?.color }}>
                      {n}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">By Source</CardTitle>
              </CardHeader>
              <CardContent>
                {donutData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No applications in this range.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <DonutChart size={90} data={donutData} />
                    <div className="flex-1 flex flex-col gap-1.5">
                      {sourceLinks.map((s) => (
                        <Link key={`${s.label}-${s.count}`} href={s.href} className="flex items-center justify-between no-underline">
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                            {s.label.slice(0, 12)}
                          </span>
                          <span className="text-[11px] font-semibold tabular-nums">{s.count}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="w-full mx-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">By Department</CardTitle>
            </CardHeader>
            <CardContent>
              {deptBar.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data in this range.</p>
              ) : (
                <BarChart data={deptBar} valueKey="value" labelKey="label" color="var(--chart-1)" height={110} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
