import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { StorageService, StoredObjectHead } from "@/src/lib/storage/types";
import { isSafeStorageKey } from "@/src/lib/storage/object-keys";

function localRoot(): string {
  const raw = process.env.STORAGE_LOCAL_DIR?.trim();
  return resolve(raw && raw.length > 0 ? raw : join(process.cwd(), "uploads"));
}

function resolveUnderRoot(key: string): string | null {
  if (!isSafeStorageKey(key)) return null;
  const root = localRoot();
  const dest = resolve(root, key);
  if (dest !== root && !dest.startsWith(root + sep)) return null;
  return dest;
}

export function createLocalStorage(): StorageService {
  return {
    provider: "local",

    async put(key, body, _contentType) {
      const dest = resolveUnderRoot(key);
      if (!dest) throw new Error("Invalid storage key");
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, body);
    },

    async get(key) {
      const dest = resolveUnderRoot(key);
      if (!dest) return null;
      try {
        return await readFile(dest);
      } catch (e) {
        const err = e as { code?: string };
        if (err.code === "ENOENT") return null;
        throw e;
      }
    },

    async head(key): Promise<StoredObjectHead | null> {
      const dest = resolveUnderRoot(key);
      if (!dest) return null;
      try {
        const s = await stat(dest);
        return { contentType: null, contentLength: s.size };
      } catch (e) {
        const err = e as { code?: string };
        if (err.code === "ENOENT") return null;
        throw e;
      }
    },

    async delete(key) {
      const dest = resolveUnderRoot(key);
      if (!dest) return;
      await unlink(dest).catch((e: { code?: string }) => {
        if (e.code !== "ENOENT") throw e;
      });
    },

    async getPresignedPutUrl() {
      return null;
    },

    async downloadToTempFile(key, fileName) {
      const body = await this.get(key);
      if (!body) return null;
      const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "object";
      const path = join(tmpdir(), `job-${randomUUID()}-${safe}`);
      await writeFile(path, body);
      return path;
    },
  };
}
