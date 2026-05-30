import { prisma } from "@/src/lib/prisma";
import { resolveJobInterviewerNames } from "@/src/lib/resolve-job-interviewers";

export type InterviewEmailInterviewer = {
  userId: string;
  name: string;
  email: string;
};

export type InterviewEmailContext = {
  interviewId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink: string | null;
  interviewerDisplay: string;
  interviewers: InterviewEmailInterviewer[];
};

export async function loadInterviewEmailContext(
  interviewId: string
): Promise<InterviewEmailContext | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      applicationId: true,
      scheduledAt: true,
      durationMinutes: true,
      meetingLink: true,
      status: true,
      interviewers: {
        select: { userId: true, user: { select: { id: true, name: true, email: true } } },
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

  const interviewers: InterviewEmailInterviewer[] = [];
  for (const row of interview.interviewers) {
    const email = row.user.email?.trim();
    if (!email) continue;
    interviewers.push({
      userId: row.user.id,
      name: row.user.name,
      email,
    });
  }

  const interviewerDisplay =
    (await resolveJobInterviewerNames(interview.application.jobId)) ??
    interviewers.map((i) => i.name).filter(Boolean).join(", ");

  return {
    interviewId: interview.id,
    applicationId: interview.applicationId,
    jobId: interview.application.jobId,
    jobTitle: interview.application.job.title,
    candidateName: interview.application.candidate.candidateName,
    candidateEmail: interview.application.candidate.email?.trim() || null,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    meetingLink: interview.meetingLink?.trim() || null,
    interviewerDisplay: interviewerDisplay || "Your recruiting team",
    interviewers,
  };
}
