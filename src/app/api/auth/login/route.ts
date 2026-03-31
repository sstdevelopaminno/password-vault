import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

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
  if (!Number.isFinite(verifiedAtMs)) {
    return { status, role, autoApproved: false };
  }

  if (Date.now() - verifiedAtMs < AUTO_APPROVE_AFTER_MS) {
    return { status, role, autoApproved: false };
  }

  const admin = createAdminClient();
  const nextRole = role === "pending" ? "user" : role;

  const [profileResult, requestResult] = await Promise.all([
    admin.from("profiles").update({ status: "active", role: nextRole }).eq("id", input.userId),
    admin
      .from("approval_requests")
      .update({ request_status: "approved", reviewed_at: new Date().toISOString(), reject_reason: null })
      .eq("user_id", input.userId)
      .eq("request_status", "pending"),
  ]);

  if (profileResult.error) {
    console.error("Auto-approve profile update failed in login:", profileResult.error.message);
    return { status, role, autoApproved: false };
  }

  if (requestResult.error) {
    console.error("Auto-approve request update failed in login:", requestResult.error.message);
  }

  return { status: "active", role: nextRole, autoApproved: true };
}

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  const ip = clientIp(req);
  const limit = takeRateLimit(`login:${ip}:${normalizedEmail}`, { limit: 10, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait.", retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const user = signInData?.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authEmail = user.email?.toLowerCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("status,email,email_verified_at,role")
    .eq("id", user.id)
    .single();

  if (authEmail && profile?.email !== authEmail) {
    void supabase.from("profiles").update({ email: authEmail }).eq("id", user.id);
  }

  if (profile?.status === "disabled") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
  }

  let status = String(profile?.status ?? "pending_approval");
  let role = String(profile?.role ?? "pending");
  const emailVerifiedAt = profile?.email_verified_at
    ? String(profile.email_verified_at)
    : user.email_confirmed_at
      ? String(user.email_confirmed_at)
      : "";

  const autoApprove = await tryAutoApprove({
    userId: user.id,
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

  return NextResponse.json({
    ok: true,
    status,
    role,
    autoApproved: autoApprove.autoApproved,
    email: authEmail ?? normalizedEmail,
    needsOtpVerification,
    pendingApproval,
  });
}
