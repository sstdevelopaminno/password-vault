import { NextResponse } from "next/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signupOtpVerifySchema } from "@/lib/validators";

const PENDING_STATUSES = new Set(["pending_approval", "pending", "awaiting_approval"]);

function isPendingStatus(status: string) {
  return PENDING_STATUSES.has(String(status ?? "").toLowerCase());
}

async function ensurePendingApprovalRequest(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: existingPending, error: existingPendingError } = await admin
    .from("approval_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("request_status", "pending")
    .limit(1)
    .maybeSingle();

  if (existingPendingError) {
    throw new Error(existingPendingError.message);
  }

  if (existingPending?.id) {
    return;
  }

  const { error: insertApprovalError } = await admin.from("approval_requests").insert({
    user_id: userId,
    request_status: "pending",
  });

  if (insertApprovalError) {
    throw new Error(insertApprovalError.message);
  }
}

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = signupOtpVerifySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid OTP payload" }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const supabase = await createClient();
  const admin = createAdminClient();

  const firstTry = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: parsed.data.otp,
    type: "signup",
  });

  if (firstTry.error) {
    const fallback = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: parsed.data.otp,
      type: "email",
    });

    if (fallback.error) {
      return NextResponse.json({ error: firstTry.error.message }, { status: 400 });
    }
  }

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Unable to resolve verified user session" }, { status: 401 });
  }

  let profile;
  try {
    const resolved = await resolveProfileForAuthUser({
      userId: user.id,
      email: String(user.email ?? normalizedEmail),
      fullName: String(user.user_metadata?.full_name ?? ""),
    });
    profile = resolved.profile;
  } catch (resolveError) {
    console.error("Profile resolution failed in verify-otp:", resolveError);
    return NextResponse.json({ error: "Account profile mismatch. Please contact admin." }, { status: 409 });
  }

  const { error: updateProfileError } = await admin
    .from("profiles")
    .update({
      email_verified_at: new Date().toISOString(),
      email: String(user.email ?? normalizedEmail).toLowerCase(),
    })
    .eq("id", user.id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 400 });
  }
  await ensurePendingApprovalRequest(admin, user.id);

  const pendingApproval = isPendingStatus(profile.status);

  return NextResponse.json({
    ok: true,
    pendingApproval,
    approved: !pendingApproval,
    agreementRequired: true,
    message: pendingApproval
      ? "OTP verified. Your account is pending admin approval."
      : "OTP verified. Your account is now active.",
  });
}

