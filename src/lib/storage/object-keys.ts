import { randomUUID } from "node:crypto";

const TENANT_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_KEY_RE = /^[a-zA-Z0-9._/-]+$/;
const LEGACY_FILE_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * No Tenant/Organization model exists in prisma/schema.prisma.
 * STORAGE_TENANT_ID is the object-key namespace until multi-tenant lands.
 */
export function getStorageTenantId(): string {
  const raw = process.env.STORAGE_TENANT_ID?.trim() || "default";
  return TENANT_RE.test(raw) ? raw : "default";
}

export function isSafeLegacyFileName(fileName: string): boolean {
  return Boolean(fileName) && LEGACY_FILE_RE.test(fileName) && !fileName.includes("..");
}

export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 512 || key.includes("..") || key.startsWith("/") || key.includes("//")) {
    return false;
  }
  if (!SAFE_KEY_RE.test(key)) return false;
  return (
    key.startsWith("tenants/") ||
    key.startsWith("resumes/") ||
    key.startsWith("profile-media/")
  );
}

export function isSafeStorageKey(nameOrKey: string): boolean {
  return isSafeObjectKey(nameOrKey) || isSafeLegacyFileName(nameOrKey);
}

export function buildResumeObjectKey(params: {
  candidateId?: string;
  ext: string;
}): string {
  const tenant = getStorageTenantId();
  const ext = params.ext.startsWith(".") ? params.ext.toLowerCase() : `.${params.ext.toLowerCase()}`;
  const uuid = randomUUID();
  if (params.candidateId) {
    return `tenants/${tenant}/resumes/${params.candidateId}/${uuid}${ext}`;
  }
  return `tenants/${tenant}/resumes/pending/${uuid}${ext}`;
}

export function buildAvatarObjectKey(ext: string): string {
  const normalized = ext === ".jpeg" ? ".jpg" : ext;
  const suffix = normalized.startsWith(".") ? normalized : `.${normalized}`;
  return `tenants/${getStorageTenantId()}/avatars/${randomUUID()}${suffix}`;
}

export function resumeKeyBelongsToCandidate(key: string, candidateId: string): boolean {
  if (!isSafeObjectKey(key) || !candidateId) return false;
  const prefix = `tenants/${getStorageTenantId()}/resumes/${candidateId}/`;
  return key.startsWith(prefix) && key.slice(prefix.length).includes("/") === false;
}

export function toResumeObjectKey(nameOrKey: string): string | null {
  if (isSafeObjectKey(nameOrKey)) return nameOrKey;
  if (isSafeLegacyFileName(nameOrKey)) return `resumes/${nameOrKey}`;
  return null;
}

export function toProfileMediaObjectKey(nameOrKey: string): string | null {
  if (isSafeObjectKey(nameOrKey)) return nameOrKey;
  if (isSafeLegacyFileName(nameOrKey)) return `profile-media/${nameOrKey}`;
  return null;
}
