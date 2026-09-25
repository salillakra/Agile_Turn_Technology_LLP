export type StorageProviderName = "local" | "s3";

export type StoredObjectHead = {
  contentType: string | null;
  contentLength: number | null;
};

export type StorageService = {
  readonly provider: StorageProviderName;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  head(key: string): Promise<StoredObjectHead | null>;
  delete(key: string): Promise<void>;
  /**
   * Presigned PUT URL for browser → object storage.
   * `local` returns null (caller must proxy bytes through the API).
   */
  getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<string | null>;
  /** Download to os.tmpdir(); caller must unlink. */
  downloadToTempFile(key: string, fileName: string): Promise<string | null>;
};
