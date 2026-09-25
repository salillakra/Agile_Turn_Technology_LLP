import type { Job } from "bullmq";
import { prisma } from "@/src/lib/prisma";
import { getStorage, toResumeObjectKey } from "@/src/lib/storage";
import type { StorageCleanupJobPayload } from "@/src/lib/queues/storage-cleanup-queue";

/**
 * Deletes object-storage keys after a candidate was soft-deleted.
 * Skips a key if the candidate was restored and still points at it.
 */
export async function processStorageCleanupJob(job: Job<StorageCleanupJobPayload>): Promise<void> {
  const { candidateId, keys } = job.data;
  const live = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { resumeObjectKey: true },
  });

  const storage = getStorage();
  for (const raw of keys) {
    const key = toResumeObjectKey(raw);
    if (!key) continue;
    if (live?.resumeObjectKey === key) continue;
    await storage.delete(key);
  }
}
