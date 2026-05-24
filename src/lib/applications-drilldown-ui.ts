import type { ApplicationStage, CandidateSource } from "@prisma/client";

/** Maps Prisma `ApplicationStage` to dashboard `STAGE_META` keys used by `StageBadge`. */
export const APPLICATION_STAGE_TO_UI_LABEL: Record<ApplicationStage, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  TECHNICAL: "Technical",
  FINAL_ROUND: "Final Round",
  OFFER_SENT: "Offer Sent",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

/** Maps Prisma `CandidateSource` to mock `SOURCES` display strings. */
export const CANDIDATE_SOURCE_TO_UI_LABEL: Record<CandidateSource, string> = {
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  REFERRAL: "Referral",
  COMPANY_WEBSITE: "Company Website",
  GLASSDOOR: "Glassdoor",
  HEADHUNTER: "Headhunter",
  OTHER: "Other",
};

export type ApplicationsApiListRow = {
  id: string;
  jobId: string;
  stage: ApplicationStage;
  rating: number | null;
  candidate: {
    id: string;
    candidateName: string;
    email: string;
    candidateSource: CandidateSource | null;
  };
  job: { id: string; title: string; department: string };
};

/** Shape expected by `Applicants` list cards (mock-compatible). */
export type ApplicantListItem = {
  /** Application id (pipeline row). */
  id: string;
  /** Candidate id — use for `/api/candidates/[id]/*` (résumé, parse). Present when row is from API. */
  candidateId?: string;
  name: string;
  email: string;
  jobId: string;
  jobTitle: string;
  dept: string;
  stage: string;
  source: string;
  rating: number;
  appliedDate: string;
  lastActivity: string;
  notes: string;
  tags: string[];
  ttFill: number;
};

export function mapApplicationsApiRowToApplicantItem(row: ApplicationsApiListRow): ApplicantListItem {
  const src = row.candidate.candidateSource;
  return {
    id: row.id,
    candidateId: row.candidate.id,
    name: row.candidate.candidateName,
    email: row.candidate.email,
    jobId: row.jobId,
    jobTitle: row.job.title,
    dept: row.job.department,
    stage: APPLICATION_STAGE_TO_UI_LABEL[row.stage] ?? row.stage,
    source: src ? CANDIDATE_SOURCE_TO_UI_LABEL[src] ?? String(src) : "Other",
    rating: row.rating ?? 0,
    appliedDate: "",
    lastActivity: "",
    notes: "",
    tags: [],
    ttFill: 0,
  };
}
