import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { hasSupabaseAuthCookie } from "@/lib/session-security";

const PENDING_STATUSES = new Set(["pending_approval", "pending", "awaiting_approval"]);

function isPendingStatus(status: string) {
  return PENDING_STATUSES.has(String(status ?? "").toLowerCase());
}

export async function GET() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (!auth.user) {
    const cookieStore = await cookies();
    const recoverableAuthState = Boolean(authError && hasSupabaseAuthCookie(cookieStore.getAll()));
    if (recoverableAuthState) {
      return NextResponse.json(
        {
          error: "Session synchronization in progress",
          recoverable: true,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authEmail = String(auth.user.email ?? "").toLowerCase();

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: authEmail,
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });
  const profile = resolved.profile;

  const status = String(profile.status ?? "active");
  const role = String(profile.role ?? "pending");
  const emailVerifiedAt = profile.email_verified_at
    ? String(profile.email_verified_at)
    : auth.user.email_confirmed_at
      ? String(auth.user.email_confirmed_at)
      : "";
  const needsOtpVerification = !emailVerifiedAt;
  const pendingApproval = isPendingStatus(status);
  return NextResponse.json({
    ok: true,
    userId: String(auth.user.id),
    fullName: String(profile.full_name ?? auth.user.user_metadata?.full_name ?? ""),
    email: String(profile.email ?? auth.user.email ?? ""),
    role,
    status,
    emailVerifiedAt,
    needsOtpVerification,
    pendingApproval,
    autoApproved: false,
  });
}


