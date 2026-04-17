import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { clampPinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC } from "@/lib/pin-session";

const PENDING_STATUSES = new Set(["pending_approval", "pending", "awaiting_approval"]);

function isPendingStatus(status: string) {
  return PENDING_STATUSES.has(String(status ?? "").toLowerCase());
}

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authEmail = String(auth.user.email ?? "").toLowerCase();

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: authEmail,
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });
  const profile = resolved.profile;

  let status = String(profile.status ?? "pending_approval");
  const role = String(profile.role ?? "pending");
  const emailVerifiedAt = profile.email_verified_at
    ? String(profile.email_verified_at)
    : auth.user.email_confirmed_at
      ? String(auth.user.email_confirmed_at)
      : "";
  if (isPendingStatus(status)) {
    status = "pending_approval";
  }

  const needsOtpVerification = !emailVerifiedAt;
  const pendingApproval = !needsOtpVerification && status !== "active";
  const hasPin = Boolean(profile.pin_hash);
  const faceAuthEnabled = Boolean(profile.face_auth_enabled);
  const faceEnrolledAt = profile.face_enrolled_at ? String(profile.face_enrolled_at) : null;
  const pinSessionEnabled =
    auth.user.user_metadata && typeof auth.user.user_metadata === "object"
      ? (auth.user.user_metadata as Record<string, unknown>).pv_pin_session_enabled !== false
      : true;
  const pinSessionTimeoutSec =
    auth.user.user_metadata && typeof auth.user.user_metadata === "object"
      ? clampPinSessionTimeoutSec(
          (auth.user.user_metadata as Record<string, unknown>).pv_pin_session_timeout_sec,
          DEFAULT_PIN_SESSION_TIMEOUT_SEC,
        )
      : DEFAULT_PIN_SESSION_TIMEOUT_SEC;

  return NextResponse.json({
    ok: true,
    userId: String(auth.user.id),
    fullName: String(profile.full_name ?? auth.user.user_metadata?.full_name ?? ""),
    email: String(profile.email ?? auth.user.email ?? ""),
    role,
    status,
    emailVerifiedAt,
    hasPin,
    faceAuthEnabled,
    faceEnrolledAt,
    pinSessionEnabled,
    pinSessionTimeoutSec,
    needsOtpVerification,
    pendingApproval,
    autoApproved: false,
  });
}


