import { enqueueEntityEmbedding } from "@/src/lib/enqueue-entity-embedding";

/**
 * Queue semantic embedding regeneration after resume NLP parse updates candidate profile.
 */
export async function enqueueCandidateEmbeddingAfterParse(
  candidateId: string
): Promise<void> {
  const result = await enqueueEntityEmbedding("candidate", candidateId, {
    jobId: `embed:candidate:${candidateId}:nlp-parse`,
    force: true,
  });
  if (!result.ok) {
    const errResult = result as { ok: false; message: string };
    console.warn(
      "[resume-parse-embedding] embedding enqueue skipped for %s: %s",
      candidateId,
      errResult.message
    );
  }
}
