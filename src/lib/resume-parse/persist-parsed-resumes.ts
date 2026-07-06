import type { Prisma, PrismaClient } from "@prisma/client";
import type { ResumeParseStrategy } from "@/src/lib/resume-parse/llm-parse-types";

type Db = Pick<PrismaClient, "parsedResume">;

export async function persistParsedResumeAudits(
  db: Db,
  params: {
    candidateId: string;
    resumeParseJobId: string;
    rulePayload: unknown;
    ruleConfidence: number;
    llmPayload: unknown | null;
    llmConfidence: number | null;
    mergedPayload: unknown;
    strategyUsed: ResumeParseStrategy;
  }
): Promise<void> {
  const rows: Prisma.ParsedResumeCreateManyInput[] = [
    {
      candidateId: params.candidateId,
      resumeParseJobId: params.resumeParseJobId,
      strategy: "RULE_BASED",
      payload: params.rulePayload as Prisma.InputJsonValue,
      confidence: params.ruleConfidence,
    },
  ];

  if (params.llmPayload) {
    rows.push({
      candidateId: params.candidateId,
      resumeParseJobId: params.resumeParseJobId,
      strategy: "LLM",
      payload: params.llmPayload as Prisma.InputJsonValue,
      confidence: params.llmConfidence,
    });
  }

  rows.push({
    candidateId: params.candidateId,
    resumeParseJobId: params.resumeParseJobId,
    strategy: params.strategyUsed === "RULE_BASED" ? "RULE_BASED" : "HYBRID",
    payload: params.mergedPayload as Prisma.InputJsonValue,
    confidence:
      params.strategyUsed === "HYBRID"
        ? Math.max(params.ruleConfidence, params.llmConfidence ?? 0)
        : params.ruleConfidence,
  });

  await db.parsedResume.createMany({ data: rows });
}
