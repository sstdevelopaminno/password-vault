import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { faceRecoveryVerifySchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { createFacePinSessionToken } from "@/lib/face-auth";
import {
  ACTIVE_SESSION_COOKIE,
  FACE_PIN_SESSION_COOKIE,
  FACE_PIN_SESSION_TTL_SEC,
  getSharedCookieOptions,
} from "@/lib/session-security";

export const runtime = "nodejs";

async function verifyOtpByAnyType(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  email: string;
  otp: string;
}) {
  const primary = await input.supabase.auth.verifyOtp({
    email: input.email,
    token: input.otp,
    type: "email",
  });
  if (!primary.error) {
    return { ok: true as const };
  }

  const fallback = await input.supabase.auth.verifyOtp({
    email: input.email,
    token: input.otp,
    type: "recovery",
  });
  if (!fallback.error) {
    return { ok: true as const };
  }

  return { ok: false as const, error: primary.error?.message || fallback.error?.message || "Invalid OTP" };
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = faceRecoveryVerifySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid OTP payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const limit = takeRateLimit(`face-auth-recovery-verify:${ip}:${auth.user.id}`, {
    limit: 6,
    windowMs: 5 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many OTP attempts. Please wait.", retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });

  const requiresFacePin = Boolean(
    resolved.profile.face_auth_enabled &&
      resolved.profile.face_enrolled_at &&
      resolved.profile.pin_hash,
  );
  if (!requiresFacePin) {
    return NextResponse.json({ error: "Face login recovery is not required for this account." }, { status: 400 });
  }

  const targetEmail = String(resolved.profile.email ?? auth.user.email ?? "").trim().toLowerCase();
  if (!targetEmail) {
    return NextResponse.json({ error: "Account email is unavailable." }, { status: 400 });
  }

  const verified = await verifyOtpByAnyType({
    supabase,
    email: targetEmail,
    otp: parsed.data.otp,
  });
  if (!verified.ok) {
    void logAudit("face_pin_recovery_otp_verify_failed", {
      actor_user_id: auth.user.id,
      ip,
    }).catch(() => {});
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  const cookieStore = await cookies();
  const activeSessionToken = String(cookieStore.get(ACTIVE_SESSION_COOKIE)?.value ?? "");
  if (!activeSessionToken) {
    return NextResponse.json({ error: "Session security token missing. Please sign in again." }, { status: 401 });
  }

  const sessionToken = createFacePinSessionToken({
    userId: auth.user.id,
    activeSession: activeSessionToken,
    ttlSec: FACE_PIN_SESSION_TTL_SEC,
  });

  void logAudit("face_pin_recovery_otp_verified", {
    actor_user_id: auth.user.id,
    ip,
  }).catch(() => {});

  const response = NextResponse.json({
    ok: true,
    message: "Recovery verification successful.",
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
