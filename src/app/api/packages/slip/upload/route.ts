import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PAYMENT_SLIP_BUCKET,
  buildPaymentSlipStoragePath,
  ensurePaymentSlipBucket,
  getPaymentSlipSignedUrlTtlSeconds,
  getPaymentSlipUploadLimitBytes,
} from "@/lib/payment-slip-storage";

function isImageMimeType(value: string) {
  const mime = String(value ?? "").toLowerCase().trim();
  return mime.startsWith("image/");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }

  const maxBytes = getPaymentSlipUploadLimitBytes();
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "file is too large" }, { status: 400 });
  }

  if (!isImageMimeType(file.type)) {
    return NextResponse.json({ error: "only image files are allowed" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await ensurePaymentSlipBucket();
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }

  const storagePath = buildPaymentSlipStoragePath({
    userId: auth.user.id,
    fileName: file.name || "payment-slip",
  });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await admin.storage.from(PAYMENT_SLIP_BUCKET).upload(storagePath, bytes, {
    upsert: false,
    cacheControl: "300",
    contentType: file.type || "application/octet-stream",
  });
  if (uploaded.error) {
    return NextResponse.json({ error: uploaded.error.message }, { status: 400 });
  }

  const expiresIn = getPaymentSlipSignedUrlTtlSeconds();
  const signed = await admin.storage.from(PAYMENT_SLIP_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message ?? "unable to sign url" }, { status: 400 });
  }

  return NextResponse.json({
    slipImageUrl: signed.data.signedUrl,
    storagePath,
    expiresInSeconds: expiresIn,
  });
}

