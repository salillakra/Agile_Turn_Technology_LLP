import { resolveJobSkillLists, type RecommendationJobInput } from "@/src/lib/recommendation-engine";

/** Max points added to `finalScore` from certification relevance (low impact by design). */
export const CANDIDATE_FIT_CERTIFICATION_BONUS_MAX_POINTS = 4;

/** Documented blend weight — bonus ≈ relevance × weight × 100 capped at max points. */
export const CANDIDATE_FIT_CERTIFICATION_WEIGHT = 0.05;

export type CertificationDomainId =
  | "aws"
  | "azure"
  | "gcp"
  | "kubernetes"
  | "security";

type CertificationDomainDefinition = {
  id: CertificationDomainId;
  label: string;
  jobPatterns: RegExp[];
  certPatterns: RegExp[];
};

const CERTIFICATION_DOMAINS: readonly CertificationDomainDefinition[] = [
  {
    id: "aws",
    label: "AWS",
    jobPatterns: [
      /\baws\b/i,
      /amazon web services/i,
      /\bs3\b/i,
      /\bec2\b/i,
      /\blambda\b/i,
      /\bdynamodb\b/i,
    ],
    certPatterns: [/\baws\b/i, /amazon web services/i, /\bsolutions architect\b/i],
  },
  {
    id: "azure",
    label: "Azure",
    jobPatterns: [
      /\bazure\b/i,
      /microsoft azure/i,
      /\bentra\b/i,
      /\barm template/i,
    ],
    certPatterns: [
      /\bazure\b/i,
      /microsoft certified/i,
      /\baz-\d{3}\b/i,
      /azure fundamentals/i,
    ],
  },
  {
    id: "gcp",
    label: "Google Cloud",
    jobPatterns: [
      /\bgcp\b/i,
      /google cloud/i,
      /\bgoogle kubernetes engine\b/i,
      /\bbigquery\b/i,
    ],
    certPatterns: [
      /google cloud/i,
      /\bgcp\b/i,
      /professional cloud architect/i,
      /associate cloud engineer/i,
    ],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    jobPatterns: [/\bkubernetes\b/i, /\bk8s\b/i, /\bhelm\b/i, /\beks\b/i, /\bgke\b/i, /\baks\b/i],
    certPatterns: [/\bkubernetes\b/i, /\bcka\b/i, /\bckad\b/i, /\bcncf\b/i],
  },
  {
    id: "security",
    label: "Security",
    jobPatterns: [
      /\bcyber\s*security\b/i,
      /\binfosec\b/i,
      /\bsoc\s*2\b/i,
      /\bpenetration test/i,
      /\bsecurity engineer/i,
    ],
    certPatterns: [
      /\bcissp\b/i,
      /\bcomptia security\+\b/i,
      /\bceh\b/i,
      /\bcism\b/i,
      /certified information systems/i,
    ],
  },
] as const;

export type CandidateCertificationRelevanceInput = {
  certifications?: readonly string[] | null;
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCertList(certs: readonly string[] | null | undefined): string[] {
  return (certs ?? []).map((c) => c.trim()).filter(Boolean);
}

function parseJobMetaText(jobMeta: unknown): string {
  if (jobMeta == null || typeof jobMeta !== "object" || Array.isArray(jobMeta)) return "";
  const parts: string[] = [];
  for (const value of Object.values(jobMeta as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) parts.push(item.trim());
      }
    }
  }
  return parts.join(" ");
}

/**
 * Infer certification domains implied by the job (title, skills, meta).
 */
export function inferJobCertificationDomains(job: RecommendationJobInput): CertificationDomainId[] {
  const { requiredRaw, preferredRaw } = resolveJobSkillLists(job);
  const corpus = [
    job.title ?? "",
    job.location ?? "",
    ...requiredRaw,
    ...preferredRaw,
    parseJobMetaText(job.jobMeta),
  ]
    .join(" ")
    .toLowerCase();

  const matched: CertificationDomainId[] = [];
  for (const domain of CERTIFICATION_DOMAINS) {
    if (domain.jobPatterns.some((p) => p.test(corpus))) {
      matched.push(domain.id);
    }
  }
  return matched;
}

function certMatchesDomain(certLabel: string, domain: CertificationDomainDefinition): boolean {
  return domain.certPatterns.some((p) => p.test(certLabel));
}

function domainLabel(id: CertificationDomainId): string {
  return CERTIFICATION_DOMAINS.find((d) => d.id === id)?.label ?? id;
}

export type CandidateCertificationRelevanceResult = {
  /** Domains inferred from the job profile. */
  jobDomains: CertificationDomainId[];
  /** Candidate cert labels that match at least one inferred job domain. */
  matchedCertifications: string[];
  /** Inferred domains with no matching candidate certification. */
  missingDomains: CertificationDomainId[];
  /** 0–100 coverage of inferred job domains. */
  certificationRelevanceScore: number;
  /** Small additive bonus for `finalScore` (≤ {@link CANDIDATE_FIT_CERTIFICATION_BONUS_MAX_POINTS}). */
  certificationBonus: number;
};

/**
 * Match candidate certifications to job-implied domains; compute low-weight bonus.
 */
export function computeCandidateCertificationRelevance(
  job: RecommendationJobInput,
  candidate: CandidateCertificationRelevanceInput
): CandidateCertificationRelevanceResult {
  const jobDomains = inferJobCertificationDomains(job);
  const certs = normalizeCertList(candidate.certifications);

  if (jobDomains.length === 0 || certs.length === 0) {
    return {
      jobDomains,
      matchedCertifications: [],
      missingDomains: [...jobDomains],
      certificationRelevanceScore: 0,
      certificationBonus: 0,
    };
  }

  const matchedCertifications: string[] = [];
  const domainsCovered = new Set<CertificationDomainId>();

  for (const cert of certs) {
    for (const domain of CERTIFICATION_DOMAINS) {
      if (!jobDomains.includes(domain.id)) continue;
      if (certMatchesDomain(cert, domain)) {
        if (!matchedCertifications.includes(cert)) {
          matchedCertifications.push(cert);
        }
        domainsCovered.add(domain.id);
      }
    }
  }

  const missingDomains = jobDomains.filter((id) => !domainsCovered.has(id));
  const certificationRelevanceScore = roundScore(
    clampPercent((domainsCovered.size / jobDomains.length) * 100)
  );

  const certificationBonus = roundScore(
    (certificationRelevanceScore / 100) * CANDIDATE_FIT_CERTIFICATION_BONUS_MAX_POINTS
  );

  return {
    jobDomains,
    matchedCertifications,
    missingDomains,
    certificationRelevanceScore,
    certificationBonus,
  };
}

/** Recruiter-facing certification line for fit breakdowns. */
export function buildCertificationRelevanceText(
  result: CandidateCertificationRelevanceResult
): string | null {
  if (result.jobDomains.length === 0) return null;

  const domainNames = result.jobDomains.map(domainLabel).join(", ");
  if (result.matchedCertifications.length === 0) {
    return `Role aligns with ${domainNames} certifications; none matched on profile.`;
  }

  const certs = result.matchedCertifications.slice(0, 3).join(", ");
  return `Relevant certifications for ${domainNames}: ${certs}${
    result.matchedCertifications.length > 3 ? "…" : ""
  } (blended at 3% of candidate fit score).`;
}
