import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export function isStorageConfigured(): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

function client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
}

export function buildDocumentKey(patientId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const rawExt = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
  const ext = rawExt ? `.${rawExt}` : "";
  const base = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `patients/${patientId}/${randomUUID()}-${base}${ext}`;
}

function checkFile(contentType: string, sizeBytes: number): string {
  const ext = ALLOWED[contentType];
  if (!ext) throw new Error("Only PDF, JPG and PNG file types are accepted");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new Error("Files must be under 10MB");
  }
  return ext;
}

export async function presignedPutUrl(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): Promise<{ url: string; key: string }> {
  checkFile(input.contentType, input.sizeBytes);
  if (!isStorageConfigured()) throw new Error("Document storage is not configured");
  const key = buildDocumentKey(input.patientId, input.fileName);
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, ContentType: input.contentType }),
    { expiresIn: 600 },
  );
  return { url, key };
}

export async function presignedGetUrl(key: string): Promise<string> {
  if (!isStorageConfigured()) throw new Error("Document storage is not configured");
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }), { expiresIn: 600 });
}
