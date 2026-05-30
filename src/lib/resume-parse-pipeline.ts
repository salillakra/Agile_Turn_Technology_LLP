import type { Prisma } from "@prisma/client";
import {
  isAiResumeParseConfigured,
  parseResumePdfFile,
} from "@/src/lib/ai-service-client";
import { buildResumeParseResultFromPlainText } from "@/src/lib/resume-parse-heuristic";
import type { ResumeParseResult } from "@/src/lib/resume-parse-result";
import { isResumeParseResult } from "@/src/lib/resume-parse-result";
import { resolveLocalResumePdfPath } from "@/src/lib/resume-local-path";
import {
  buildCandidateSemanticTextFromParse,
  type ParseSemanticProfileInput,
} from "@/src/lib/candidate-semantic-text";
import {
  structuredResumeParseToResultJson,
  type ParseResumeApiResponse,
  type StructuredResumeParse,
} from "@/src/lib/structured-resume-parse";
import { enqueueCandidateEmbeddingAfterParse } from "@/src/lib/resume-parse-embedding";

export type ResumeParsePipelineInput = {
  plainText: string;
  resumeUrl: string;
  candidateName: string;
};

export type ResumeParsePipelineOutput = {
  resultJson: ResumeParseResult;
  structured: StructuredResumeParse | null;
  semanticProfileText: string;
  parseSource: "ai-service" | "heuristic";
};

function structuredFromAiResponse(response: ParseResumeApiResponse): StructuredResumeParse {
  const { rawText: _rawText, ...structured } = response;
  return structured;
}

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

/**
 * Run NLP parse (ai-service when configured + PDF path) or heuristic fallback.
 */
export async function runResumeParsePipeline(
  input: ResumeParsePipelineInput
): Promise<ResumeParsePipelineOutput> {
  const pdfPath = resolveLocalResumePdfPath(input.resumeUrl);

  if (isAiResumeParseConfigured() && pdfPath) {
    const ai = await parseResumePdfFile(pdfPath);
    if (ai.ok) {
      const structured = structuredFromAiResponse(ai.response);
      const resultJson = structuredResumeParseToResultJson(
        structured,
        input.candidateName.trim() || "Unknown"
      );
      return {
        resultJson,
        structured,
        semanticProfileText: buildSemanticProfile(structured, resultJson),
        parseSource: "ai-service",
      };
    }
    console.warn(
      "[resume-parse-pipeline] ai-service parse failed, using heuristic: %s",
      ai.error
    );
  }

  const heuristic = buildResumeParseResultFromPlainText(
    input.plainText,
    input.candidateName
  );
  const structured = heuristic.structured ?? null;

  return {
    resultJson: structured
      ? structuredResumeParseToResultJson(structured, heuristic.name)
      : heuristic,
    structured,
    semanticProfileText: buildSemanticProfile(structured, heuristic),
    parseSource: "heuristic",
  };
}

export type FinalizeResumeParseParams = {
  candidateId: string;
  pipeline: ResumeParsePipelineOutput;
};

/**
 * After parse: sync candidate columns, complete job storage, enqueue embedding worker.
 */
export function buildParseJobResultJson(
  pipeline: ResumeParsePipelineOutput
): Prisma.InputJsonValue {
  const value: unknown = pipeline.resultJson;
  if (isResumeParseResult(value)) {
    // Ensure we never persist `undefined` values (Prisma JSON strips them → `{}`).
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
    } as unknown as Prisma.InputJsonValue;
  }
  return {
    name: "Unknown",
    skills: [],
    experience: { years: 0, summary: "No summary extracted." },
  } as unknown as Prisma.InputJsonValue;
}

export { enqueueCandidateEmbeddingAfterParse };
