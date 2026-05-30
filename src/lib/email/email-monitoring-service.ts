import type { EmailDeliveryStatus, Prisma } from "@prisma/client";
import {
  getApplicationsCreatedAtFilter,
  parseDashboardRange,
  type DashboardRange,
} from "@/src/lib/dashboard-range";
import type {
  EmailMonitoringDashboard,
  EmailMonitoringFilter,
  EmailMonitoringTypeFilter,
} from "@/src/lib/email/email-monitoring-types";
import {
  emailTypeGroupKey,
  labelForEmailType,
  resolveEmailTypeFilter,
} from "@/src/lib/email/email-template-taxonomy";
import { prisma } from "@/src/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateParam(value: string | null): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function terminalDeliveryRate(sent: number, failed: number): number | null {
  const terminal = sent + failed;
  if (terminal === 0) return null;
  return Math.round((sent / terminal) * 10_000) / 10_000;
}

function retryUnitsFromAttemptCount(attemptCount: number): number {
  return Math.max(0, attemptCount - 1);
}

function toUtcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function parseEmailMonitoringFilter(
  searchParams: URLSearchParams
): EmailMonitoringFilter | null {
  const range = parseDashboardRange(searchParams.get("range") ?? "30d");
  if (!range) return null;

  const dateFrom = parseDateParam(searchParams.get("dateFrom"));
  const dateTo = parseDateParam(searchParams.get("dateTo"));

  let from: Date | undefined = dateFrom;
  let to: Date | undefined = dateTo;

  if (!from && range !== "all") {
    const gte = getApplicationsCreatedAtFilter(range)?.gte;
    from = gte;
  }
  if (!to) {
    to = new Date();
  }

  const statusRaw = searchParams.get("status")?.trim().toUpperCase();
  const status =
    statusRaw === "PENDING" || statusRaw === "SENT" || statusRaw === "FAILED"
      ? (statusRaw as EmailDeliveryStatus)
      : undefined;

  const emailType = (searchParams.get("emailType") ??
    searchParams.get("type") ??
    "all") as EmailMonitoringTypeFilter;

  return { range, from, to, status, emailType };
}

function buildWhere(filter: EmailMonitoringFilter): Prisma.EmailLogWhereInput {
  const where: Prisma.EmailLogWhereInput = {};

  const createdAt: Prisma.DateTimeFilter = {};
  if (filter.from) createdAt.gte = filter.from;
  if (filter.to) createdAt.lt = filter.to;
  if (Object.keys(createdAt).length > 0) {
    where.createdAt = createdAt;
  }

  if (filter.status) {
    where.status = filter.status;
  }

  const typeFilter = resolveEmailTypeFilter(String(filter.emailType));
  if (typeFilter.mode === "template") {
    where.template = typeFilter.template;
  } else if (typeFilter.mode === "templates") {
    where.template = { in: typeFilter.templates };
  }

  return where;
}

type LogRow = {
  id: string;
  recipient: string;
  subject: string;
  template: string;
  status: EmailDeliveryStatus;
  error: string | null;
  sentAt: Date | null;
  attemptCount: number;
  createdAt: Date;
};

/**
 * Aggregate {@link EmailLog} rows for the operational email monitoring dashboard.
 */
export async function getEmailMonitoringDashboard(
  filter: EmailMonitoringFilter
): Promise<EmailMonitoringDashboard> {
  const where = buildWhere(filter);

  const rows = await prisma.emailLog.findMany({
    where,
    select: {
      id: true,
      recipient: true,
      subject: true,
      template: true,
      status: true,
      error: true,
      sentAt: true,
      attemptCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50_000,
  });

  let emailsSent = 0;
  let failedEmails = 0;
  let pendingEmails = 0;
  let retryCount = 0;

  const byTypeMap = new Map<
    string,
    { sent: number; failed: number; pending: number; retryCount: number }
  >();
  const byStatusMap = new Map<EmailDeliveryStatus, number>();
  const byDayMap = new Map<
    string,
    { sent: number; failed: number; pending: number }
  >();

  for (const row of rows) {
    retryCount += retryUnitsFromAttemptCount(row.attemptCount);
    byStatusMap.set(row.status, (byStatusMap.get(row.status) ?? 0) + 1);

    const dayKey = toUtcDateKey(row.createdAt);
    const day =
      byDayMap.get(dayKey) ?? { sent: 0, failed: 0, pending: 0 };

    const group = emailTypeGroupKey(row.template);
    const typeAgg =
      byTypeMap.get(group) ?? { sent: 0, failed: 0, pending: 0, retryCount: 0 };
    typeAgg.retryCount += retryUnitsFromAttemptCount(row.attemptCount);

    if (row.status === "SENT") {
      emailsSent += 1;
      day.sent += 1;
      typeAgg.sent += 1;
    } else if (row.status === "FAILED") {
      failedEmails += 1;
      day.failed += 1;
      typeAgg.failed += 1;
    } else {
      pendingEmails += 1;
      day.pending += 1;
      typeAgg.pending += 1;
    }

    byDayMap.set(dayKey, day);
    byTypeMap.set(group, typeAgg);
  }

  const byEmailType = [...byTypeMap.entries()]
    .map(([emailType, agg]) => ({
      emailType,
      label: labelForEmailType(emailType),
      emailsSent: agg.sent,
      failedEmails: agg.failed,
      pendingEmails: agg.pending,
      deliveryRate: terminalDeliveryRate(agg.sent, agg.failed),
      retryCount: agg.retryCount,
    }))
    .sort((a, b) => b.emailsSent + b.failedEmails - (a.emailsSent + a.failedEmails));

  const byStatus = (["PENDING", "SENT", "FAILED"] as const).map((status) => ({
    status,
    count: byStatusMap.get(status) ?? 0,
  }));

  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({
      date,
      emailsSent: agg.sent,
      failedEmails: agg.failed,
      pendingEmails: agg.pending,
    }));

  const recentFailures: LogRow[] = rows
    .filter((r) => r.status === "FAILED")
    .slice(0, 25);

  const fromIso = filter.from?.toISOString() ?? new Date(0).toISOString();
  const toIso = filter.to?.toISOString() ?? new Date().toISOString();

  return {
    filters: {
      range: filter.range,
      from: fromIso,
      to: toIso,
      status: filter.status ?? "all",
      emailType: filter.emailType,
    },
    summary: {
      emailsSent,
      failedEmails,
      pendingEmails,
      totalEmails: rows.length,
      deliveryRate: terminalDeliveryRate(emailsSent, failedEmails),
      retryCount,
    },
    byEmailType,
    byStatus,
    byDay,
    recentFailures: recentFailures.map((r) => ({
      id: r.id,
      recipient: r.recipient,
      subject: r.subject,
      template: r.template,
      status: r.status,
      error: r.error,
      sentAt: r.sentAt?.toISOString() ?? null,
      attemptCount: r.attemptCount,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** Default window when UI has not picked custom dates. */
export function defaultMonitoringRange(): DashboardRange {
  return "30d";
}
