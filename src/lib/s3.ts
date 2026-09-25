import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

export function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  return bucket;
}

export function getS3Client(): S3Client {
  if (client) return client;

  const endpoint = process.env.AWS_ENDPOINT_URL?.trim() || undefined;
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for S3 uploads");
  }

  client = new S3Client({
    region,
    endpoint,
    // Path-style is required for custom S3-compatible endpoints.
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

function isNotFound(e: unknown): boolean {
  const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const status = err.$metadata?.httpStatusCode;
  return (
    err.name === "NoSuchKey" ||
    err.name === "NotFound" ||
    err.name === "NoSuchBucket" ||
    err.Code === "NoSuchKey" ||
    err.Code === "NoSuchBucket" ||
    status === 404
  );
}

export async function ensureS3Bucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const s3 = getS3Client();
      const Bucket = getS3Bucket();
      try {
        await s3.send(new HeadBucketCommand({ Bucket }));
      } catch (e) {
        if (!isNotFound(e)) throw e;
        await s3.send(new CreateBucketCommand({ Bucket }));
      }
    })().catch((e) => {
      bucketReady = null;
      throw e;
    });
  }
  await bucketReady;
}

export async function putS3Object(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureS3Bucket();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getS3Object(key: string): Promise<Buffer | null> {
  try {
    const out = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
      })
    );
    if (!out.Body) return null;
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function deleteS3Object(key: string): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
      })
    );
  } catch (e) {
    if (isNotFound(e)) return;
    throw e;
  }
}

export async function headS3Object(
  key: string
): Promise<{ contentType: string | null; contentLength: number | null } | null> {
  try {
    const out = await getS3Client().send(
      new HeadObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
      })
    );
    return {
      contentType: out.ContentType ?? null,
      contentLength: typeof out.ContentLength === "number" ? out.ContentLength : null,
    };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number
): Promise<string> {
  await ensureS3Bucket();
  return getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSeconds }
  );
}
