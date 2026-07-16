import type { Prisma } from "@prisma/client";
import {
  isAiResumeLlmParseConfigured,
  parseResumeTextWithLlm,
} from "@/src/lib/ai-service-client";
import {
  buildCandidateSemanticTextFromParse,
  type ParseSemanticProfileInput,
} from "@/src/lib/candidate-semantic-text";
import type { HybridParseMeta, LlmParseResult, ResumeParseStrategy } from "@/src/lib/resume-parse/llm-parse-types";
import { shouldCallLlm } from "@/src/lib/resume-parse/llm-gate";
import { mergeResumeParses } from "@/src/lib/resume-parse/merge-resume-parses";
import { ruleBasedParse } from "@/src/lib/resume-parse/rule-based-parse";
import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import { isResumeParseResult } from "@/src/lib/resume-parse-result";
import { RESUME_PARSE_LIMITS } from "@/src/lib/resume-parse-limits";
import { truncateSummaryWithFullStop } from "@/src/lib/text-terminal-punctuation";
import type { StructuredResumeParse } from "@/src/lib/structured-resume-parse";
import { resolveLocalResumeFilePath, resolveLocalResumePdfPath } from "@/src/lib/resume-local-path";
import { enqueueCandidateEmbeddingAfterParse } from "@/src/lib/resume-parse-embedding";

export type ResumeParsePipelineInput = {
  plainText: string;
  resumeUrl: string;
  candidateName: string;
  pdfPath?: string | null;
  pdfBuffer?: Buffer | null;
  /** When true, only attempt LLM enrichment (PARTIAL retry path). */
  llmRetryOnly?: boolean;
};

export type ResumeParsePipelineOutput = {
  resultJson: ResumeParseResult & { hybrid?: HybridParseMeta };
  structured: StructuredResumeParse | null;
  semanticProfileText: string;
  parseSource: "hybrid" | "rule-based" | "heuristic";
  strategyUsed: ResumeParseStrategy;
  ruleConfidence: number;
  llmConfidence: number | null;
  disagreementFlags: string[];
  /** True when rule result persisted but LLM failed/skipped — schedule retry. */
  partialLlmMiss: boolean;
  llmSkippedReason: string | null;
  hybridMeta: HybridParseMeta;
};

function buildSemanticProfile(
  structured: StructuredResumeParse | null,
  result: ResumeParseResult
): string {
  const input: ParseSemanticProfileInput = structured
    ? {
        skills:
          structured.skills.length > 0 ? structured.skills : structured.normalizedSkills,
        summary: structured.summary,
        designation: structured.currentDesignation,
        experienceYears: structured.totalExperience,
      }
    : {
        skills: result.skills,
        summary: result.experience.summary,
        designation: null,
        experienceYears: result.experience.years,
      };

  return buildCandidateSemanticTextFromParse(input);
}

function mergedToResultJson(
  merged: ReturnType<typeof mergeResumeParses>,
  hybridMeta: HybridParseMeta
): ResumeParseResult & { hybrid?: HybridParseMeta } {
  return {
    name: merged.name,
    skills: merged.skills.length > 0 ? merged.skills : ["(none detected — edit in review)"],
    experience: {
      years: merged.experienceYears,
      summary: truncateSummaryWithFullStop(merged.summary, RESUME_PARSE_LIMITS.MAX_SUMMARY_LEN),
    },
    structured: merged.structured,
    hybrid: hybridMeta,
  };
}

/**
 * Hybrid parse: rule-based always (free) → gated Gemini LLM → merge.
 */
export async function runResumeParsePipeline(
  input: ResumeParsePipelineInput
): Promise<ResumeParsePipelineOutput> {
  const fallbackName = input.candidateName.trim() || "Unknown";
  const pdfPath =
    input.pdfPath ??
    resolveLocalResumePdfPath(input.resumeUrl) ??
    resolveLocalResumeFilePath(input.resumeUrl);

  const rule = await ruleBasedParse({
    plainText: input.plainText,
    fallbackName,
    pdfPath: pdfPath?.toLowerCase().endsWith(".pdf") ? pdfPath : null,
    pdfBuffer: input.pdfBuffer ?? null,
  });

  let llm: LlmParseResult | null = null;
  let llmSkippedReason: string | null = null;
  let partialLlmMiss = false;

  const gate = shouldCallLlm({
    plainText: input.plainText,
    rule,
    llmRetryOnly: Boolean(input.llmRetryOnly),
  });

  if (isAiResumeLlmParseConfigured() && gate.call) {
    const llmResult = await parseResumeTextWithLlm(input.plainText);
    if (llmResult.ok) {
      llm = llmResult.response;
    } else {
      partialLlmMiss = true;
      const errResult = llmResult as { ok: false; error: string };
      llmSkippedReason = errResult.error;
      console.warn("[resume-parse-pipeline] LLM parse failed: %s", errResult.error);
    }
  } else if (!isAiResumeLlmParseConfigured()) {
    llmSkippedReason = "llm_not_configured";
  } else {
    llmSkippedReason = gate.reason;
  }

  const merged = mergeResumeParses(rule, llm, fallbackName);

  let strategyUsed: ResumeParseStrategy = "RULE_BASED";
  if (llm) {
    strategyUsed = "HYBRID";
  } else if (input.llmRetryOnly) {
    strategyUsed = "RULE_BASED";
  }

  const hybridMeta: HybridParseMeta = {
    strategyUsed,
    ruleConfidence: rule.confidence,
    llmConfidence: llm?.confidence ?? null,
    disagreementFlags: merged.disagreementFlags,
    llmSkippedReason,
    sources: { rule, llm },
  };

  const resultJson = mergedToResultJson(merged, hybridMeta);

  return {
    resultJson,
    structured: merged.structured,
    semanticProfileText: buildSemanticProfile(merged.structured, resultJson),
    parseSource: llm ? "hybrid" : rule.parser === "open-resume" ? "rule-based" : "heuristic",
    strategyUsed,
    ruleConfidence: rule.confidence,
    llmConfidence: llm?.confidence ?? null,
    disagreementFlags: merged.disagreementFlags,
    partialLlmMiss,
    llmSkippedReason,
    hybridMeta,
  };
}

export type FinalizeResumeParseParams = {
  candidateId: string;
  pipeline: ResumeParsePipelineOutput;
};

export function buildParseJobResultJson(
  pipeline: ResumeParsePipelineOutput
): Prisma.InputJsonValue {
  const value: unknown = pipeline.resultJson;
  if (isResumeParseResult(value)) {
    return {
      name: value.name ?? "Unknown",
      skills: Array.isArray(value.skills) ? value.skills : [],
      experience: {
        years:
          typeof value.experience?.years === "number" && Number.isFinite(value.experience.years)
            ? value.experience.years
            : 0,
        summary: typeof value.experience?.summary === "string" ? value.experience.summary : "",
      },
      ...(value.structured ? { structured: value.structured } : {}),
      ...(value.hybrid ? { hybrid: value.hybrid } : {}),
    } as unknown as Prisma.InputJsonValue;
  }
  return {
    name: "Unknown",
    skills: [],
    experience: { years: 0, summary: "No summary extracted." },
  } as unknown as Prisma.InputJsonValue;
}

export { enqueueCandidateEmbeddingAfterParse };
