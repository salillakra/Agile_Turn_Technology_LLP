import type { EmailDeliveryStatus } from "@prisma/client";
import type { DashboardRange } from "@/src/lib/dashboard-range";

/** Dashboard filter: template key, preference category, or `transactional` bucket. */
export type EmailMonitoringTypeFilter =
  | "all"
  | "transactional"
  | "stage_updates"
  | "interview_reminders"
  | "marketing_emails"
  | (string & {});

export type EmailMonitoringFilter = {
  range: DashboardRange;
  /** Inclusive lower bound (UTC) when `dateFrom` / `range` set. */
  from?: Date;
  /** Exclusive upper bound (UTC); defaults to now. */
  to?: Date;
  status?: EmailDeliveryStatus;
  emailType: EmailMonitoringTypeFilter;
};

export type EmailMonitoringSummary = {
  /** Rows with `status === SENT` in range. */
  emailsSent: number;
  /** Rows with `status === FAILED` in range. */
  failedEmails: number;
  /** Rows still `PENDING` (queued or retrying). */
  pendingEmails: number;
  /** All rows matching filters (any status). */
  totalEmails: number;
  /**
   * `emailsSent / (emailsSent + failedEmails)` when denominator > 0, else `null`.
   * Terminal outcomes only (excludes pending).
   */
  deliveryRate: number | null;
  /** Sum of `max(0, attemptCount - 1)` — proxy for BullMQ retry volume. */
  retryCount: number;
};

export type EmailMonitoringByTypeRow = {
  emailType: string;
  label: string;
  emailsSent: number;
  failedEmails: number;
  pendingEmails: number;
  deliveryRate: number | null;
  retryCount: number;
};

export type EmailMonitoringByDayRow = {
  /** UTC date `YYYY-MM-DD`. */
  date: string;
  emailsSent: number;
  failedEmails: number;
  pendingEmails: number;
};

export type EmailMonitoringRecentRow = {
  id: string;
  recipient: string;
  subject: string;
  template: string;
  status: EmailDeliveryStatus;
  error: string | null;
  sentAt: string | null;
  attemptCount: number;
  createdAt: string;
};

export type EmailMonitoringDashboard = {
  filters: {
    range: DashboardRange;
    from: string;
    to: string;
    status: EmailDeliveryStatus | "all";
    emailType: EmailMonitoringTypeFilter;
  };
  summary: EmailMonitoringSummary;
  byEmailType: EmailMonitoringByTypeRow[];
  byStatus: Array<{ status: EmailDeliveryStatus; count: number }>;
  byDay: EmailMonitoringByDayRow[];
  recentFailures: EmailMonitoringRecentRow[];
};
