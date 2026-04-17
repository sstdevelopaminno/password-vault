import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import {
  isOtpProviderConfigError,
  isOtpSendConstraintError,
  parseRetryAfterSeconds,
  sendRecoveryOtpViaFallback,
} from "@/lib/otp-delivery";

export const runtime = "nodejs";

function resolveTargetEmail(authEmail: string, profileEmail: string) {
  const fromProfile = String(profileEmail ?? "").trim().toLowerCase();
  if (fromProfile) return fromProfile;
  return String(authEmail ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const limit = takeRateLimit(`face-auth-recovery-request:${ip}:${auth.user.id}`, {
    limit: 3,
    windowMs: 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "OTP rate limited. Please wait.", retryAfterSec: limit.retryAfterSec },
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

  const targetEmail = resolveTargetEmail(auth.user.email ?? "", resolved.profile.email);
  if (!targetEmail) {
    return NextResponse.json({ error: "Account email is unavailable." }, { status: 400 });
  }

  const otpRes = await supabase.auth.signInWithOtp({
    email: targetEmail,
    options: { shouldCreateUser: false },
  });

  if (otpRes.error) {
    if (!isOtpSendConstraintError(otpRes.error.message)) {
      return NextResponse.json({ error: otpRes.error.message }, { status: 400 });
    }

    const fallback = await sendRecoveryOtpViaFallback(targetEmail);
    if (fallback.ok) {
      void logAudit("face_pin_recovery_otp_requested", {
        actor_user_id: auth.user.id,
        ip,
        channel: fallback.channel,
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        retryAfterSec: fallback.retryAfterSec,
        channel: fallback.channel,
        message: "OTP sent for face login recovery.",
      });
    }

    if (isOtpProviderConfigError(fallback.error ?? "")) {
      return NextResponse.json(
        { error: "OTP delivery service unavailable. Please try again shortly." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "OTP rate limited. Please wait.",
        retryAfterSec: fallback.retryAfterSec || parseRetryAfterSeconds(otpRes.error.message) || 60,
      },
      { status: 429 },
    );
  }

  void logAudit("face_pin_recovery_otp_requested", {
    actor_user_id: auth.user.id,
    ip,
    channel: "supabase",
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    retryAfterSec: 60,
    channel: "supabase",
    message: "OTP sent for face login recovery.",
  });
}
