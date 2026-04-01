import { NextResponse } from "next/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signupOtpVerifySchema } from "@/lib/validators";

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
      status: "pending_approval",
      role: profile.role === "pending" ? "user" : profile.role,
      email: String(user.email ?? normalizedEmail).toLowerCase(),
    })
    .eq("id", user.id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 400 });
  }

  const { data: pendingRequest } = await admin
    .from("approval_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("request_status", "pending")
    .maybeSingle();

  if (!pendingRequest?.id) {
    await admin.from("approval_requests").insert({
      user_id: user.id,
      request_status: "pending",
    });
  }

  return NextResponse.json({
    ok: true,
    pendingApproval: true,
    message: "OTP verified. Auto approval will complete in 1-2 minutes.",
  });
}
