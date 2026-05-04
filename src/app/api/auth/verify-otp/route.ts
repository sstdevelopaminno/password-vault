import { NextResponse } from "next/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signupOtpVerifySchema } from "@/lib/validators";
import { ensureStarterPlan } from "@/lib/package-subscriptions";

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

  try {
    await resolveProfileForAuthUser({
      userId: user.id,
      email: String(user.email ?? normalizedEmail),
      fullName: String(user.user_metadata?.full_name ?? ""),
    });
  } catch (resolveError) {
    console.error("Profile resolution failed in verify-otp:", resolveError);
    return NextResponse.json({ error: "Account profile mismatch. Please contact admin." }, { status: 409 });
  }

  const { error: updateProfileError } = await admin
    .from("profiles")
    .update({
      role: "user",
      status: "active",
      email_verified_at: new Date().toISOString(),
      email: String(user.email ?? normalizedEmail).toLowerCase(),
    })
    .eq("id", user.id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 400 });
  }
  await ensureStarterPlan(admin, user.id);
  return NextResponse.json({
    ok: true,
    pendingApproval: false,
    approved: true,
    agreementRequired: true,
    message: "OTP verified. Your account is now active.",
  });
}

