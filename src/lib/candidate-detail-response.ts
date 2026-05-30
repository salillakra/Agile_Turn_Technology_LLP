import type { Prisma } from "@prisma/client";
import { parseEducationJson } from "@/src/lib/candidate-structured-profile";

const authorSelect = { id: true, name: true, email: true } as const;

/** Prisma include for full candidate detail (matches GET /api/candidates/[id]). */
export const candidateDetailInclude = {
  candidateSkills: { select: { id: true, skillName: true } },
  notes: {
    include: { author: { select: authorSelect } },
    orderBy: { createdAt: "desc" as const },
  },
  candidateNotes: {
    include: { author: { select: authorSelect } },
    orderBy: { createdAt: "desc" as const },
  },
  applications: {
    include: {
      job: { select: { id: true, title: true, department: true, status: true } },
    },
    orderBy: { appliedDate: "desc" as const },
  },
} satisfies Prisma.CandidateInclude;

export type CandidateDetailPayload = Prisma.CandidateGetPayload<{
  include: typeof candidateDetailInclude;
}>;

/** JSON shape returned by GET /api/candidates/[id] and POST .../resume. */
export function formatCandidateDetail(candidate: CandidateDetailPayload): Record<string, unknown> {
  const {
    candidateSkills,
    notes,
    candidateNotes,
    applications,
    createdAt,
    updatedAt,
    ...info
  } = candidate;

  return {
    ...info,
    education: parseEducationJson(candidate.education) ?? [],
    createdAt,
    updatedAt,
    skills: candidateSkills.map((s) => s.skillName),
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      author: n.author,
    })),
    recruiterNotes: candidateNotes.map((n) => ({
      id: n.id,
      note: n.note,
      createdAt: n.createdAt,
      author: n.author,
    })),
    applications: applications.map((a) => ({
      id: a.id,
      jobId: a.jobId,
      job: a.job,
      stage: a.stage,
      rating: a.rating,
      appliedDate: a.appliedDate,
    })),
  };
}
