import { createLocalStorage } from "@/src/lib/storage/local-fs";
import { getStorageProviderName } from "@/src/lib/storage/provider";
import { createS3CompatibleStorage } from "@/src/lib/storage/s3-compatible";
import type { StorageProviderName, StorageService } from "@/src/lib/storage/types";

export type { StorageProviderName, StorageService, StoredObjectHead } from "@/src/lib/storage/types";
export { getStorageProviderName, isDirectUploadEnabled } from "@/src/lib/storage/provider";
export {
  buildAvatarObjectKey,
  buildResumeObjectKey,
  getStorageTenantId,
  isSafeLegacyFileName,
  isSafeObjectKey,
  isSafeStorageKey,
  resumeKeyBelongsToCandidate,
  toProfileMediaObjectKey,
  toResumeObjectKey,
} from "@/src/lib/storage/object-keys";

let instance: StorageService | null = null;
let instanceProvider: StorageProviderName | null = null;

export function getStorage(): StorageService {
  const provider = getStorageProviderName();
  if (instance && instanceProvider === provider) return instance;
  instance = provider === "local" ? createLocalStorage() : createS3CompatibleStorage();
  instanceProvider = provider;
  return instance;
}
