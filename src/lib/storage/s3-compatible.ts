import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  deleteS3Object,
  getPresignedPutUrl as s3PresignedPutUrl,
  getS3Object,
  headS3Object,
  putS3Object,
} from "@/src/lib/s3";
import type { StorageService } from "@/src/lib/storage/types";

export function createS3CompatibleStorage(): StorageService {
  return {
    provider: "s3",

    async put(key, body, contentType) {
      await putS3Object(key, body, contentType);
    },

    async get(key) {
      return getS3Object(key);
    },

    async head(key) {
      return headS3Object(key);
    },

    async delete(key) {
      await deleteS3Object(key);
    },

    async getPresignedPutUrl(key, contentType, expiresInSeconds) {
      return s3PresignedPutUrl(key, contentType, expiresInSeconds);
    },

    async downloadToTempFile(key, fileName) {
      const body = await getS3Object(key);
      if (!body) return null;
      const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "object";
      const path = join(tmpdir(), `job-${randomUUID()}-${safe}`);
      await writeFile(path, body);
      return path;
    },
  };
}
