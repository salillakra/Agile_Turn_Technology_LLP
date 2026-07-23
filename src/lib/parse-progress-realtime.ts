import { isRedisConfigured } from "@/src/lib/redis-config";
import { getSharedRedisClient } from "@/src/lib/redis-connection";
import { prisma } from "@/src/lib/prisma";

/** Redis pub/sub channel for live resume-parse progress (SSE clients). */
export function parseProgressUserChannel(userId: string): string {
  return `parse-progress:user:${userId}`;
}

export type ParseProgressRealtimePayload = {
  type: "updated";
  candidateId: string;
  status: string;
  error?: string | null;
};

export async function publishParseProgressUpdated(
  userId: string,
  payload: Omit<ParseProgressRealtimePayload, "type">
): Promise<void> {
  if (!userId.trim() || !isRedisConfigured()) return;
  const client = getSharedRedisClient("default");
  if (!client) return;
  const body: ParseProgressRealtimePayload = { type: "updated", ...payload };
  try {
    await client.publish(parseProgressUserChannel(userId), JSON.stringify(body));
  } catch (err) {
    console.warn("[parse-progress-realtime] publish failed:", err);
  }
}

/** Notify candidate owner (+ optional createdBy) so dashboard SSE can refresh counts. */
export function scheduleParseProgressForCandidate(
  candidateId: string,
  status: string,
  error?: string | null
): void {
  void (async () => {
    const row = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { ownerId: true, createdById: true },
    });
    if (!row) return;
    const targets = new Set<string>([row.ownerId]);
    if (row.createdById) targets.add(row.createdById);
    await Promise.all(
      [...targets].map((uid) =>
        publishParseProgressUpdated(uid, {
          candidateId,
          status,
          error: error ?? null,
        })
      )
    );
  })().catch((err) => {
    console.warn("[parse-progress-realtime] schedule failed:", err);
  });
}
