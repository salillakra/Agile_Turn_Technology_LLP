import { after } from "next/server";
import { prisma } from "@/src/lib/prisma";
import {
  scheduleInterviewEntityReminderEmails,
  type InterviewEntityReminderRecipient,
  type ScheduleInterviewEntityRemindersParams,
} from "@/src/lib/enqueue-interview-reminder";
import { resolveJobInterviewerNames } from "@/src/lib/resolve-job-interviewers";

export type { ScheduleInterviewEntityRemindersParams };

/**
 * Build reminder recipients + metadata from a persisted interview row.
 */
export async function loadInterviewEntityReminderParams(
  interviewId: string
): Promise<ScheduleInterviewEntityRemindersParams | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      applicationId: true,
      scheduledAt: true,
      meetingLink: true,
      status: true,
      interviewers: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
      application: {
        select: {
          id: true,
          jobId: true,
          candidate: { select: { candidateName: true, email: true } },
          job: { select: { title: true } },
        },
      },
    },
  });

  if (!interview?.application) return null;
  if (interview.status === "CANCELLED" || interview.status === "COMPLETED") {
    return null;
  }

  const recipients: InterviewEntityReminderRecipient[] = [];
  const candidateEmail = interview.application.candidate.email?.trim();
  if (candidateEmail) {
    recipients.push({
      kind: "candidate",
      email: candidateEmail,
      name: interview.application.candidate.candidateName,
    });
  }

  for (const row of interview.interviewers) {
    const email = row.user.email?.trim();
    if (!email) continue;
    recipients.push({
      kind: "interviewer",
      userId: row.user.id,
      email,
      name: row.user.name,
    });
  }

  const interviewerDisplay =
    (await resolveJobInterviewerNames(interview.application.jobId)) ??
    interview.interviewers.map((i) => i.user.name).filter(Boolean).join(", ");

  return {
    interviewId: interview.id,
    applicationId: interview.applicationId,
    interviewDate: interview.scheduledAt,
    jobTitle: interview.application.job.title,
    candidateName: interview.application.candidate.candidateName,
    meetingLink: interview.meetingLink ?? undefined,
    interviewerDisplay: interviewerDisplay || undefined,
    recipients,
  };
}

/** Post-response scheduling for interview entity reminders (24h + 1h, all recipients). */
export function scheduleInterviewEntityRemindersAfterSet(interviewId: string): void {
  after(async () => {
    const params = await loadInterviewEntityReminderParams(interviewId);
    if (!params) return;
    await scheduleInterviewEntityReminderEmails(params);
  });
}

export function scheduleInterviewEntityRemindersBestEffort(
  params: ScheduleInterviewEntityRemindersParams
): void {
  after(async () => {
    await scheduleInterviewEntityReminderEmails(params);
  });
}
