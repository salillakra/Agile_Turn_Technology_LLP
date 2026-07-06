import type {
  ApplicationStage,
  Notification,
  NotificationPriority,
  NotificationReferenceType,
  NotificationType,
} from "@prisma/client";
import {
  buildCandidateStageUpdateSubject,
  formatApplicationStageLabel,
} from "@/src/lib/application-stage-labels";
import { enqueueOfferSentEmail } from "@/src/lib/enqueue-offer-sent";
import { enqueueEmailJob } from "@/src/lib/queues/email-queue";
import { QueueEnqueueRateLimitedError } from "@/src/lib/queues/queue-enqueue-rate-limit";
import { isRedisConfigured } from "@/src/lib/queues/redis";
import { prisma } from "./prisma";
import { shouldNotifyStageChangeInApp } from "@/src/lib/notification-stage-policy";
import {
  ACTIVITY_ACTION_NOTIFICATION_SENT,
  buildStageChangeNotificationSentDetails,
  serializeActivityLogDetails,
} from "@/src/lib/activity-log-details";
import { scheduleNotificationFeedUpdated } from "@/src/lib/notification-realtime";

/**
 * Optional: suppress duplicate `STAGE_CHANGED` rows for the same user + copy within this window (ms).
 * Set `NOTIFICATION_STAGE_DEDUP_WINDOW_MS=0` to disable. Default `120000` (2 minutes).
 */
function getStageChangeDedupWindowMs(): number {
  const raw = process.env.NOTIFICATION_STAGE_DEDUP_WINDOW_MS;
  if (raw === undefined || raw === "") return 120_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 120_000;
  return n;
}

/** Returns true if an identical `STAGE_CHANGED` was already stored for this user recently. */
async function hasRecentDuplicateStageChangeNotification(
  userId: string,
  title: string,
  message: string,
  windowMs: number
): Promise<boolean> {
  if (windowMs <= 0) return false;
  const cutoff = new Date(Date.now() - windowMs);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "STAGE_CHANGED",
      title,
      message,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  return existing != null;
}

/** Stages whose transition destination should surface as high-priority alerts. */
const HIGH_PRIORITY_STAGE_DESTINATIONS = new Set([
  "INTERVIEW",
  "OFFER_SENT",
  "HIRED",
]);

/**
 * Priority for `STAGE_CHANGED` rows from the **new** pipeline stage (`toStage`).
 * INTERVIEW, OFFER_SENT, HIRED → `HIGH`; all other destinations → `MEDIUM`.
 */
export function notificationPriorityForStageChangeDestination(
  toStage: string
): NotificationPriority {
  return HIGH_PRIORITY_STAGE_DESTINATIONS.has(toStage) ? "HIGH" : "MEDIUM";
}

/**
 * Creates a persisted in-app notification for a user.
 * Call from API routes, cron workers, or any server module that should notify a user.
 *
 * @param userId — Recipient `User.id` (must exist; FK enforced by Prisma).
 * @param type — `NotificationType` (DB enum); use for filtering and client routing.
 * @param title — Short heading for lists and badges.
 * @param message — Body text (`Notification.message` is `@db.Text`).
 * @param priority — Optional `NotificationPriority`; omit or `null` for legacy/unspecified.
 * @param reference — Optional deep link: `referenceId` + `referenceType` (`APPLICATION` = pipeline row, `CANDIDATE` = person).
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  priority?: NotificationPriority | null,
  reference?: { type: NotificationReferenceType; id: string } | null
): Promise<Notification> {
  const row = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      ...(priority != null ? { priority } : {}),
      ...(reference != null
        ? { referenceId: reference.id, referenceType: reference.type }
        : {}),
    },
  });
  scheduleNotificationFeedUpdated(userId);
  return row;
}

const RECRUITER_ROLES = ["ADMIN", "RECRUITER"] as const;

async function listRecruiterUserIds(excludeUserId?: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: [...RECRUITER_ROLES] },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function listAdminUserIds(excludeUserId?: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

function uniqIds(...groups: Array<string[] | null | undefined>): string[] {
  const out = new Set<string>();
  for (const g of groups) {
    if (!g) continue;
    for (const id of g) out.add(id);
  }
  return [...out];
}

/**
 * Recipients for job-scoped alerts (stage changes, offer sent, etc.):
 *
 * 1. **Job creator (recruiter)** — `Job.createdBy` → `User.id` of whoever created the requisition.
 * 2. **Assigned hiring managers** — rows in `JobAssignment` for this job whose `User.role` is
 *    `HIRING_MANAGER` (Prisma: `job.assignments`; there is no `assignedManagers` field on `Job`).
 *
 * De-duplicates when the creator is also assigned. Optionally omits `excludeUserId` (e.g. actor who
 * triggered the action) from the set.
 */
async function listJobRecruiterAndAssignedHiringManagerUserIds(
  jobId: string,
  excludeUserId?: string
): Promise<string[]> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      createdBy: true,
      assignments: {
        where: { user: { role: "HIRING_MANAGER" } },
        select: { userId: true },
      },
    },
  });
  if (!job) return [];
  const ids = new Set<string>();
  ids.add(job.createdBy);
  for (const a of job.assignments) {
    ids.add(a.userId);
  }
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

async function listJobAssignmentUserIds(jobId: string, excludeUserId?: string): Promise<string[]> {
  const rows = await prisma.jobAssignment.findMany({
    where: { jobId },
    select: { userId: true },
  });
  const unique = [...new Set(rows.map((r) => r.userId))];
  return excludeUserId ? unique.filter((id) => id !== excludeUserId) : unique;
}

/**
 * New candidate in the system — notify all recruiters (ADMIN + RECRUITER), including the user who added them.
 * (Excluding the actor left solo recruiters with zero recipients and no in-app notification.)
 */
export async function notifyRecruitersCandidateAdded(input: {
  candidateId: string;
  candidateName: string;
  actorUserId?: string;
}): Promise<void> {
  const { candidateId, candidateName } = input;
  const ids = await listRecruiterUserIds();
  if (ids.length === 0) return;
  await Promise.all(
    ids.map((userId) =>
      createNotification(
        userId,
        "CANDIDATE_CREATED",
        "New candidate added",
        `${candidateName} was added to the talent pool (candidate id: ${candidateId}).`,
        "LOW",
        { type: "CANDIDATE", id: candidateId }
      )
    )
  );
}

/**
 * New application — notify all recruiters (ADMIN + RECRUITER), including the user who created the application.
 */
export async function notifyRecruitersApplicationCreated(input: {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  jobId: string;
  actorUserId?: string;
}): Promise<void> {
  const { applicationId, candidateName, jobTitle } = input;
  const ids = await listRecruiterUserIds();
  if (ids.length === 0) return;
  await Promise.all(
    ids.map((userId) =>
      createNotification(
        userId,
        "APPLICATION_CREATED",
        "New application",
        `${candidateName} applied for "${jobTitle}" (application ${applicationId}).`,
        "MEDIUM",
        { type: "APPLICATION", id: applicationId }
      )
    )
  );
}

/**
 * Pipeline stage change: persists one in-app row per recipient via {@link createNotification}
 * with `type: "STAGE_CHANGED"` (Prisma `NotificationType.STAGE_CHANGED`).
 *
 * **Recipients:** job creator (`Job.createdBy`) plus each hiring manager on `JobAssignment` for
 * this job (see {@link listJobRecruiterAndAssignedHiringManagerUserIds}). All receive the same
 * title/message.
 *
 * **Priority:** `HIGH` when `toStage` is `INTERVIEW`, `OFFER_SENT`, or `HIRED`; otherwise `MEDIUM`
 * (see {@link notificationPriorityForStageChangeDestination}).
 *
 * **Spam controls:** (1) No notification if stage is unchanged or transition is not meaningful
 * ({@link shouldNotifyStageChangeInApp}). (2) Optional dedupe: same `title` + `message` + user within
 * the window from env `NOTIFICATION_STAGE_DEDUP_WINDOW_MS` (ms; default 120000; `0` = off).
 *
 * **Call site:** `PATCH /api/applications/[id]/stage` and bulk-stage — should gate on
 * `shouldNotifyStageChangeInApp` / unchanged stage where applicable.
 *
 * **ActivityLog:** When at least one `STAGE_CHANGED` in-app row is persisted (after dedupe), creates
 * `ActivityLog` with `action` `NOTIFICATION_SENT` and JSON `details.kind === "STAGE_CHANGED"`.
 */
export async function notifyHiringManagersStageChanged(input: {
  applicationId: string;
  candidateId: string;
  fromStage: string;
  toStage: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  actorUserId?: string;
}): Promise<void> {
  if (
    !shouldNotifyStageChangeInApp(
      input.fromStage as ApplicationStage,
      input.toStage as ApplicationStage
    )
  ) {
    return;
  }

  const stakeholderIds = uniqIds(
    await listJobRecruiterAndAssignedHiringManagerUserIds(input.jobId, input.actorUserId),
    // Admin should also receive job-scoped pipeline notifications even when not assigned.
    await listAdminUserIds(input.actorUserId)
  );
  if (stakeholderIds.length === 0) return;

  const oldStage = formatApplicationStageLabel(input.fromStage);
  const newStage = formatApplicationStageLabel(input.toStage);

  const title = `Stage: ${oldStage} → ${newStage}`;

  const message = `${input.candidateName} moved from ${oldStage} to ${newStage} for ${input.jobTitle} role`;

  const priority = notificationPriorityForStageChangeDestination(input.toStage);
  const dedupMs = getStageChangeDedupWindowMs();

  const createdFlags = await Promise.all(
    stakeholderIds.map(async (userId) => {
      if (await hasRecentDuplicateStageChangeNotification(userId, title, message, dedupMs)) {
        return false;
      }
      await createNotification(userId, "STAGE_CHANGED", title, message, priority, {
        type: "APPLICATION",
        id: input.applicationId,
      });
      return true;
    })
  );
  const notificationsCreated = createdFlags.filter(Boolean).length;

  if (notificationsCreated > 0) {
    try {
      const detailsObj = buildStageChangeNotificationSentDetails(
        input.fromStage,
        input.toStage,
        notificationsCreated,
        input.jobId
      );
      const serialized = serializeActivityLogDetails(detailsObj);
      if (serialized.ok) {
        await prisma.activityLog.create({
          data: {
            applicationId: input.applicationId,
            candidateId: input.candidateId,
            userId: input.actorUserId ?? null,
            action: ACTIVITY_ACTION_NOTIFICATION_SENT,
            details: serialized.json,
          },
        });
      }
    } catch (err) {
      console.error("[notifications] activity log NOTIFICATION_SENT failed", err);
    }
  }
}

/**
 * Candidate reached INTERVIEW — notify users explicitly assigned to the job (interviewer / HM pool).
 * In this schema, assignments are `JobAssignment` rows; there is no separate interviewer table.
 */
export async function notifyAssignedInterviewersForInterviewStage(input: {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  actorUserId?: string;
}): Promise<void> {
  const ids = await listJobAssignmentUserIds(input.jobId, input.actorUserId);
  if (ids.length === 0) return;

  await Promise.all(
    ids.map((userId) =>
      createNotification(
        userId,
        "INTERVIEW_SCHEDULED",
        "Interview stage — review candidate",
        `${input.candidateName} is in Interview for "${input.jobTitle}" (application ${input.applicationId}).`,
        "HIGH",
        { type: "APPLICATION", id: input.applicationId }
      )
    )
  );

  if (!isRedisConfigured()) return;

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, email: { not: null } },
    select: { id: true, email: true },
  });

  await Promise.all(
    users.map(async (user) => {
      const recipient = user.email?.trim();
      if (!recipient) return;
      try {
        await enqueueEmailJob(
          {
            recipient,
            subject: `Interview — ${input.candidateName}`,
            template: "interview_notification",
            data: {
              applicationId: input.applicationId,
              jobId: input.jobId,
              jobTitle: input.jobTitle,
              candidateName: input.candidateName,
            },
          },
          {
            jobId: `email:interview:${input.applicationId}:${user.id}`,
          }
        );
      } catch (err) {
        if (err instanceof QueueEnqueueRateLimitedError) {
          console.warn(
            "[notifications] interview email enqueue rate limited retryAfter=%ss",
            err.retryAfterSeconds
          );
        } else {
          console.error("[notifications] interview email enqueue failed", err);
        }
      }
    })
  );
}

export type { OfferSentEmailPayload } from "@/src/lib/enqueue-offer-sent";

export type CandidateStageUpdateEmailPayload = {
  candidateEmail: string;
  candidateName: string;
  applicationId: string;
  jobTitle: string;
  fromStage: string;
  toStage: string;
};

/**
 * Enqueue candidate stage-update email (BullMQ `ats:email`, template `stage_update`).
 * Does not send mail — the email worker delivers asynchronously.
 * Skips when Redis is unset, recipient is empty, or `toStage` is `OFFER_SENT` (use `offer_sent`).
 */
export async function notifyCandidateStageChangeEmailDeferred(
  payload: CandidateStageUpdateEmailPayload
): Promise<void> {
  const recipient = payload.candidateEmail?.trim();
  if (!recipient || !isRedisConfigured()) return;
  if (payload.toStage === "OFFER_SENT") return;

  const oldStage = formatApplicationStageLabel(payload.fromStage);
  const newStage = formatApplicationStageLabel(payload.toStage);
  const subject = buildCandidateStageUpdateSubject(payload.jobTitle);

  try {
    const enqueueResult = await enqueueEmailJob(
      {
        recipient,
        subject,
        template: "stage_update",
        data: {
          candidateName: payload.candidateName,
          jobTitle: payload.jobTitle,
          oldStage,
          newStage,
          fromStage: payload.fromStage,
          toStage: payload.toStage,
          applicationId: payload.applicationId,
        },
      },
      { jobId: `email:stage-update:${payload.applicationId}:${payload.toStage}` }
    );
    if (!enqueueResult.enqueued) return;
  } catch (err) {
    if (err instanceof QueueEnqueueRateLimitedError) {
      console.warn(
        "[notifications] candidate stage email enqueue rate limited retryAfter=%ss",
        err.retryAfterSeconds
      );
    } else {
      console.error("[notifications] candidate stage email enqueue failed", err);
    }
  }
}

/**
 * Enqueue offer letter email (`offer_sent`). Prefer {@link scheduleOfferSentEmail} from API routes.
 */
export async function notifyCandidateOfferSentEmailDeferred(
  payload: import("@/src/lib/enqueue-offer-sent").OfferSentEmailPayload
): Promise<void> {
  await enqueueOfferSentEmail(payload);
}

/** @deprecated Use {@link scheduleOfferSentEmail} from `@/src/lib/schedule-offer-sent-email`. */
export { scheduleOfferSentEmail } from "@/src/lib/schedule-offer-sent-email";

/**
 * In-app alert when an offer is recorded — same recipient policy as stage changes:
 * {@link listJobRecruiterAndAssignedHiringManagerUserIds}.
 */
export async function notifyJobStakeholdersOfferSent(input: {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  actorUserId?: string;
}): Promise<void> {
  const stakeholderIds = uniqIds(
    await listJobRecruiterAndAssignedHiringManagerUserIds(input.jobId, input.actorUserId),
    // Admin should also receive job-scoped offer notifications even when not assigned.
    await listAdminUserIds(input.actorUserId)
  );
  if (stakeholderIds.length === 0) return;
  await Promise.all(
    stakeholderIds.map((userId) =>
      createNotification(
        userId,
        "OFFER_SENT",
        "Offer sent",
        `Offer sent for ${input.candidateName} on "${input.jobTitle}" (application ${input.applicationId}).`,
        "HIGH",
        { type: "APPLICATION", id: input.applicationId }
      )
    )
  );
}

/** Log notification failures without failing API handlers. */
export function scheduleNotificationWork(work: Promise<unknown>): void {
  void work.catch((err) => {
    console.error("[notifications]", err);
  });
}
