import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { faceVerifySchema } from "@/lib/validators";
import { decryptText } from "@/lib/crypto";
import { verifyPin } from "@/lib/pin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  FACE_LOCK_MINUTES,
  FACE_MATCH_THRESHOLD,
  FACE_MAX_FAILED_ATTEMPTS,
  bestFaceSimilarity,
  createFacePinSessionToken,
  mirrorFaceVector,
  normalizeFaceVector,
  parseStoredFaceTemplate,
} from "@/lib/face-auth";
import {
  ACTIVE_SESSION_COOKIE,
  FACE_PIN_SESSION_COOKIE,
  FACE_PIN_SESSION_TTL_SEC,
  getSharedCookieOptions,
} from "@/lib/session-security";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

function lockUntilIso() {
  return new Date(Date.now() + FACE_LOCK_MINUTES * 60 * 1000).toISOString();
}

function retryAfterFromIso(value: string) {
  const diff = Date.parse(value) - Date.now();
  return Math.max(1, Math.ceil(diff / 1000));
}

async function registerFailedAttempt(input: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  failedAttempts: number;
  reason: string;
}) {
  const nextAttempts = input.failedAttempts + 1;
  const nowIso = new Date().toISOString();
  const shouldLock = nextAttempts >= FACE_MAX_FAILED_ATTEMPTS;
  const nextLockedUntil = shouldLock ? lockUntilIso() : null;

  await input.admin
    .from("user_face_biometrics")
    .update({
      failed_attempts: shouldLock ? 0 : nextAttempts,
      locked_until: nextLockedUntil,
      updated_at: nowIso,
    })
    .eq("user_id", input.userId);

  return {
    locked: Boolean(nextLockedUntil),
    lockedUntil: nextLockedUntil,
    reason: input.reason,
  };
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = faceVerifySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const limit = await takeRateLimit(`face-pin-verify:${ip}:${auth.user.id}`, { limit: 12, windowMs: 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait.", retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });

  if (!resolved.profile.face_auth_enabled) {
    return NextResponse.json({ error: "Face login is disabled." }, { status: 403 });
  }
  if (!resolved.profile.pin_hash) {
    return NextResponse.json({ error: "PIN is required for this account." }, { status: 403 });
  }

  const admin = createAdminClient();
  const biometric = await admin
    .from("user_face_biometrics")
    .select("template_encrypted,failed_attempts,locked_until")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (biometric.error) {
    return NextResponse.json({ error: biometric.error.message }, { status: 400 });
  }
  if (!biometric.data?.template_encrypted) {
    return NextResponse.json({ error: "Face enrollment not found." }, { status: 403 });
  }

  const currentFailedAttempts = Number(biometric.data.failed_attempts ?? 0);
  const lockedUntil = String(biometric.data.locked_until ?? "");
  if (lockedUntil && Date.parse(lockedUntil) > Date.now()) {
    return NextResponse.json(
      { error: "Face verification is temporarily locked.", retryAfterSec: retryAfterFromIso(lockedUntil) },
      { status: 423 },
    );
  }

  const pinOk = await verifyPin(parsed.data.pin, resolved.profile.pin_hash);
  if (!pinOk) {
    const failed = await registerFailedAttempt({
      admin,
      userId: auth.user.id,
      failedAttempts: currentFailedAttempts,
      reason: "invalid_pin",
    });
    void logAudit("face_pin_verify_failed", {
      actor_user_id: auth.user.id,
      ip,
      reason: failed.reason,
      locked: failed.locked,
    }).catch(() => {});

    if (failed.locked && failed.lockedUntil) {
      return NextResponse.json(
        { error: "Face verification is temporarily locked.", retryAfterSec: retryAfterFromIso(failed.lockedUntil) },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: "PIN or face verification failed." }, { status: 403 });
  }

  let similarity = -1;
  let matchMode: "direct" | "mirrored" = "direct";
  try {
    const template = parseStoredFaceTemplate(decryptText(String(biometric.data.template_encrypted)));
    const inputVector = normalizeFaceVector(parsed.data.sample.vector);
    const directSimilarity = bestFaceSimilarity(inputVector, template.vectors);
    const mirroredSimilarity = bestFaceSimilarity(mirrorFaceVector(inputVector), template.vectors);
    similarity = Math.max(directSimilarity, mirroredSimilarity);
    matchMode = mirroredSimilarity > directSimilarity ? "mirrored" : "direct";
  } catch (error) {
    console.error("Failed to parse face template:", error);
    return NextResponse.json({ error: "Face template unavailable. Please enroll again." }, { status: 500 });
  }

  if (!Number.isFinite(similarity) || similarity < FACE_MATCH_THRESHOLD) {
    const failed = await registerFailedAttempt({
      admin,
      userId: auth.user.id,
      failedAttempts: currentFailedAttempts,
      reason: "face_mismatch",
    });
    void logAudit("face_pin_verify_failed", {
      actor_user_id: auth.user.id,
      ip,
      reason: failed.reason,
      similarity: Number.isFinite(similarity) ? Number(similarity.toFixed(4)) : null,
      locked: failed.locked,
    }).catch(() => {});

    if (failed.locked && failed.lockedUntil) {
      return NextResponse.json(
        { error: "Face verification is temporarily locked.", retryAfterSec: retryAfterFromIso(failed.lockedUntil) },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: "PIN or face verification failed." }, { status: 403 });
  }

  const cookieStore = await cookies();
  const activeSessionToken = String(cookieStore.get(ACTIVE_SESSION_COOKIE)?.value ?? "");
  if (!activeSessionToken) {
    return NextResponse.json({ error: "Session security token missing. Please sign in again." }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const reset = await admin
    .from("user_face_biometrics")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_verified_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", auth.user.id);

  if (reset.error) {
    return NextResponse.json({ error: reset.error.message }, { status: 400 });
  }

  const sessionToken = createFacePinSessionToken({
    userId: auth.user.id,
    activeSession: activeSessionToken,
    ttlSec: FACE_PIN_SESSION_TTL_SEC,
  });

  void logAudit("face_pin_verified", {
    actor_user_id: auth.user.id,
    ip,
    similarity: Number(similarity.toFixed(4)),
    match_mode: matchMode,
  }).catch(() => {});

  const response = NextResponse.json({
    ok: true,
    similarity: Number(similarity.toFixed(4)),
    matchMode,
  });
  response.cookies.set({
    name: FACE_PIN_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: FACE_PIN_SESSION_TTL_SEC,
  });
  return response;
}

