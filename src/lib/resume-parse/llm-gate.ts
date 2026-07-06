import type { RuleBasedParseResult } from "@/src/lib/resume-parse/rule-based-parse";
import { isLlmCircuitOpen } from "@/src/lib/resume-parse/llm-circuit-breaker";

export type LlmGateDecision = {
  call: boolean;
  reason: string;
};

function minTextChars(): number {
  const n = parseInt(process.env.AI_RESUME_LLM_MIN_TEXT_CHARS ?? "250", 10);
  return Number.isFinite(n) && n >= 0 ? n : 250;
}

function skipHighConfidenceThreshold(): number {
  const n = parseFloat(process.env.AI_RESUME_LLM_SKIP_CONFIDENCE ?? "0.92");
  return Number.isFinite(n) ? n : 0.92;
}

/**
 * Cost gate: skip Gemini when rule parse is already strong or text is unusable.
 * Rule parse always runs; this only controls whether we spend LLM tokens.
 */
export function shouldCallLlm(params: {
  plainText: string;
  rule: RuleBasedParseResult;
  llmRetryOnly: boolean;
}): LlmGateDecision {
  const force =
    process.env.AI_RESUME_LLM_FORCE?.trim().toLowerCase() === "1" ||
    process.env.AI_RESUME_LLM_FORCE?.trim().toLowerCase() === "true";

  if (force) return { call: true, reason: "forced" };
  if (params.llmRetryOnly) return { call: true, reason: "llm_retry" };
  if (isLlmCircuitOpen()) return { call: false, reason: "circuit_open" };

  const textLen = params.plainText.trim().length;
  if (textLen < minTextChars()) {
    return { call: false, reason: "text_too_short" };
  }

  const skipHigh =
    process.env.AI_RESUME_LLM_SKIP_HIGH_CONFIDENCE?.trim().toLowerCase() !== "0" &&
    process.env.AI_RESUME_LLM_SKIP_HIGH_CONFIDENCE?.trim().toLowerCase() !== "false";

  if (skipHigh && params.rule.confidence >= skipHighConfidenceThreshold()) {
    const hasContact = Boolean(params.rule.email || params.rule.phone);
    const hasSkills = params.rule.skills.length >= 5;
    const hasName = Boolean(params.rule.name);
    const hasWork =
      Array.isArray(params.rule.workExperience) && params.rule.workExperience.length > 0;
    if (hasContact && hasSkills && hasName && hasWork) {
      return { call: false, reason: "high_confidence_open_resume" };
    }
    if (hasContact && hasSkills && hasName) {
      return { call: false, reason: "high_confidence_rule_only" };
    }
  }

  return { call: true, reason: "enrichment_needed" };
}
