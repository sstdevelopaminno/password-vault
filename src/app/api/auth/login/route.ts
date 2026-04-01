import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  ACTIVE_SESSION_COOKIE,
  createActiveSessionToken,
  getSharedCookieOptions,
} from "@/lib/session-security";
import { enqueuePushNotification, processPushQueue } from "@/lib/push-queue";

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
    console.error("Auto-approve profile update by id failed in login:", byId.error.message);
  }

  const requestResult = await admin
    .from("approval_requests")
    .update({ request_status: "approved", reviewed_at: new Date().toISOString(), reject_reason: null })
    .eq("user_id", input.userId)
    .eq("request_status", "pending");
  if (requestResult.error) {
    console.error("Auto-approve request update failed in login:", requestResult.error.message);
  }

  return { status: "active", role: nextRole, autoApproved: true };
}

async function bindActiveSession(userId: string, appMetadata: unknown) {
  const admin = createAdminClient();
  const token = createActiveSessionToken();
  const nextMetadata =
    appMetadata && typeof appMetadata === "object"
      ? { ...(appMetadata as Record<string, unknown>) }
      : ({} as Record<string, unknown>);

  nextMetadata.pv_active_session = token;
  nextMetadata.pv_active_updated_at = new Date().toISOString();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMetadata,
  });

  return { token, error };
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

  const authEmail = user.email?.toLowerCase() ?? normalizedEmail;

  let profile;
  try {
    const resolved = await resolveProfileForAuthUser({
      userId: user.id,
      email: authEmail,
      fullName: String(user.user_metadata?.full_name ?? ""),
    });
    profile = resolved.profile;
  } catch (resolveError) {
    console.error("Failed to resolve profile in login:", resolveError);
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Account profile mismatch. Please contact admin." }, { status: 409 });
  }

  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
  }

  let status = String(profile.status ?? "pending_approval");
  let role = String(profile.role ?? "pending");
  const emailVerifiedAt = profile.email_verified_at
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

  const binding = await bindActiveSession(user.id, user.app_metadata);
  if (binding.error) {
    console.error("Active session binding failed in login:", binding.error.message);
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Unable to secure this login session. Please try again." },
      { status: 503 },
    );
  }

  const needsOtpVerification = !emailVerifiedAt;
  const pendingApproval = !needsOtpVerification && status !== "active";

  const response = NextResponse.json({
    ok: true,
    status,
    role,
    autoApproved: autoApprove.autoApproved,
    email: authEmail,
    needsOtpVerification,
    pendingApproval,
  });

  response.cookies.set({
    name: ACTIVE_SESSION_COOKIE,
    value: binding.token,
    httpOnly: true,
    ...getSharedCookieOptions(),
  });

  void enqueuePushNotification({
    userId: user.id,
    kind: "auth",
    title: "Login successful",
    message: `A login was completed from IP ${ip}.`,
    href: "/home",
    tag: "auth-login-success",
    priority: 6,
  })
    .then((queued) => {
      if (!queued.ok) return;
      void processPushQueue({ batchSize: 10 }).catch((queueError) => {
        console.error("Push process after login failed:", queueError);
      });
    })
    .catch((queueError) => {
      console.error("Push enqueue on login failed:", queueError);
    });

  return response;
}
