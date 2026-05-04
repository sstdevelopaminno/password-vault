import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFileName } from "@/lib/workspace-cloud";

export const PAYMENT_SLIP_BUCKET = "payment-slips";

function asInt(raw: unknown, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isBucketNotFoundError(message: unknown) {
  const normalized = String(message ?? "").toLowerCase();
  return normalized.includes("not found") || normalized.includes("does not exist");
}

function isBucketAlreadyExistsError(message: unknown) {
  const normalized = String(message ?? "").toLowerCase();
  return normalized.includes("already exists") || normalized.includes("duplicate");
}

export function getPaymentSlipUploadLimitBytes() {
  const maxMb = asInt(process.env.PAYMENT_SLIP_UPLOAD_MAX_MB ?? 10, 10, 1, 30);
  return maxMb * 1024 * 1024;
}

export function getPaymentSlipSignedUrlTtlSeconds() {
  return asInt(process.env.PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS ?? 7200, 7200, 300, 86400);
}

export async function ensurePaymentSlipBucket() {
  const admin = createAdminClient();
  const bucket = await admin.storage.getBucket(PAYMENT_SLIP_BUCKET);
  if (!bucket.error) return;
  if (!isBucketNotFoundError(bucket.error.message)) {
    throw new Error(bucket.error.message);
  }

  const created = await admin.storage.createBucket(PAYMENT_SLIP_BUCKET, {
    public: false,
    fileSizeLimit: getPaymentSlipUploadLimitBytes(),
  });
  if (created.error && !isBucketAlreadyExistsError(created.error.message)) {
    throw new Error(created.error.message);
  }
}

export function buildPaymentSlipStoragePath(input: {
  userId: string;
  fileName: string;
}) {
  const safeName = normalizeFileName(input.fileName || "payment-slip");
  const stamp = Date.now();
  const random = Math.floor(Math.random() * 1_000_000_000)
    .toString(36)
    .slice(0, 8);
  return `users/${input.userId}/${stamp}-${random}-${safeName}`;
}

