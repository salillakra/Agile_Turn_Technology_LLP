/**
 * In-process circuit breaker for ai-service LLM calls.
 * Opens after repeated failures to avoid cost + latency during outages.
 */

type CircuitState = {
  failures: number;
  openedAt: number | null;
};

const state: CircuitState = { failures: 0, openedAt: null };

function failureThreshold(): number {
  const n = parseInt(process.env.AI_RESUME_LLM_CB_FAILURES ?? "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function openDurationMs(): number {
  const n = parseInt(process.env.AI_RESUME_LLM_CB_OPEN_MS ?? "120000", 10);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

export function isLlmCircuitOpen(): boolean {
  if (state.openedAt === null) return false;
  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= openDurationMs()) {
    state.openedAt = null;
    state.failures = 0;
    return false;
  }
  return true;
}

export function recordLlmSuccess(): void {
  state.failures = 0;
  state.openedAt = null;
}

export function recordLlmFailure(): void {
  state.failures += 1;
  if (state.failures >= failureThreshold()) {
    state.openedAt = Date.now();
    console.warn(
      "[llm-circuit-breaker] OPEN after %d failures (cooldown %dms)",
      state.failures,
      openDurationMs()
    );
  }
}

export function llmCircuitStatus(): { open: boolean; failures: number } {
  return { open: isLlmCircuitOpen(), failures: state.failures };
}
