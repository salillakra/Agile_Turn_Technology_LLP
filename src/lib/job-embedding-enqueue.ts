import { enqueueEntityEmbedding } from "@/src/lib/enqueue-entity-embedding";

export type EnqueueJobEmbeddingAfterChangeOptions = {
  /** When true, worker re-embeds even if cached semantic text matches (default: true). */
  force?: boolean;
  /** BullMQ job id suffix for observability (e.g. created, updated). */
  reason?: "created" | "updated";
};

/**
 * Queue background job embedding generation after create/update.
 * Does not call `/embed` — the embedding worker runs `syncJobEmbedding`.
 */
export async function enqueueJobEmbeddingAfterJobChange(
  jobId: string,
  options: EnqueueJobEmbeddingAfterChangeOptions = {}
): Promise<void> {
  const id = jobId.trim();
  if (!id) return;

  const reason = options.reason ?? "updated";
  const result = await enqueueEntityEmbedding("job", id, {
    jobId: `embed:job:${id}:${reason}`,
    force: options.force !== false,
  });

  if (!result.ok) {
    const errResult = result as { ok: false; message: string };
    console.warn(
      "[job-embedding-enqueue] embedding enqueue skipped for job %s (%s): %s",
      id,
      reason,
      errResult.message
    );
  }
}
