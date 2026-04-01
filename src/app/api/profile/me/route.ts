import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";

const AUTO_APPROVE_AFTER_MS = 2 * 60 * 1000;
const PENDING_STATUSES = new Set(["pending_approval", "pending", "awaiting_approval"]);

function isPendingStatus(status: string) {
  return PENDING_STATUSES.has(String(status ?? "").toLowerCase());
}

async function tryAutoApprove(input: { userId: string; status: string; role: string; emailVerifiedAt: string }) {
  const status = String(input.status ?? "");
  const role = String(input.role ?? "pending");
  const emailVerifiedAt = String(input.emailVerifiedAt ?? "");

  if (!isPendingStatus(status) || !emailVerifiedAt) {
    return { status, role, autoApproved: false };
  }

  const verifiedAtMs = Date.parse(emailVerifiedAt);
  if (!Number.isFinite(verifiedAtMs) || Date.now() - verifiedAtMs < AUTO_APPROVE_AFTER_MS) {
    return { status, role, autoApproved: false };
  }

  const admin = createAdminClient();
  const nextRole = role === "pending" ? "user" : role;

  const byId = await admin.from("profiles").update({ status: "active", role: nextRole }).eq("id", input.userId);
  if (byId.error) {
    console.error("Auto-approve profile update by id failed in profile/me:", byId.error.message);
  }

  const requestResult = await admin
    .from("approval_requests")
    .update({ request_status: "approved", reviewed_at: new Date().toISOString(), reject_reason: null })
    .eq("user_id", input.userId)
    .eq("request_status", "pending");
  if (requestResult.error) {
    console.error("Auto-approve request update failed in profile/me:", requestResult.error.message);
  }

  return { status: "active", role: nextRole, autoApproved: true };
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
  let role = String(profile.role ?? "pending");
  const emailVerifiedAt = profile.email_verified_at
    ? String(profile.email_verified_at)
    : auth.user.email_confirmed_at
      ? String(auth.user.email_confirmed_at)
      : "";

  const autoApprove = await tryAutoApprove({
    userId: auth.user.id,
    status,
    role,
    emailVerifiedAt,
  });

  status = autoApprove.status;
  role = autoApprove.role;
  if (isPendingStatus(status)) {
    status = "pending_approval";
  }

  const needsOtpVerification = !emailVerifiedAt;
  const pendingApproval = !needsOtpVerification && status !== "active";
  const hasPin = Boolean(profile.pin_hash);

  return NextResponse.json({
    ok: true,
    userId: String(auth.user.id),
    fullName: String(profile.full_name ?? auth.user.user_metadata?.full_name ?? ""),
    email: String(profile.email ?? auth.user.email ?? ""),
    role,
    status,
    emailVerifiedAt,
    hasPin,
    needsOtpVerification,
    pendingApproval,
    autoApproved: autoApprove.autoApproved,
  });
}
