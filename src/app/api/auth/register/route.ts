import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validators";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function isAlreadyRegisteredError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  );
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid signup payload" }, { status: 400 });
    }

    const { email, password, fullName, otp } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const admin = createAdminClient();
    const supabase = await createClient();

    if (!otp) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { full_name: fullName } },
      });

      if (signUpError) {
        if (!isAlreadyRegisteredError(signUpError.message)) {
          return NextResponse.json({ error: signUpError.message }, { status: 400 });
        }

        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id,email_verified_at")
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (existingProfile?.email_verified_at) {
          return NextResponse.json({ error: "Email already registered" }, { status: 409 });
        }

        const resend = await supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
        });

        if (resend.error) {
          return NextResponse.json({ error: resend.error.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true, otpRequired: true, message: "OTP sent to your email" });
      }

      const userId = signUpData.user?.id;
      if (userId) {
        await admin.from("profiles").upsert({
          id: userId,
          email: normalizedEmail,
          full_name: fullName,
          role: "pending",
          status: "pending_approval",
        });

        const { data: pendingRequest } = await admin
          .from("approval_requests")
          .select("id")
          .eq("user_id", userId)
          .eq("request_status", "pending")
          .maybeSingle();

        if (!pendingRequest?.id) {
          await admin.from("approval_requests").insert({
            user_id: userId,
            request_status: "pending",
          });
        }
      }

      return NextResponse.json({ ok: true, otpRequired: true, message: "OTP sent to your email" });
    }

    const verifyAsSignup = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: "signup",
    });

    if (verifyAsSignup.error) {
      const verifyAsEmail = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: "email",
      });

      if (verifyAsEmail.error) {
        return NextResponse.json({ error: verifyAsSignup.error.message }, { status: 400 });
      }
    }

    await admin
      .from("profiles")
      .update({ email_verified_at: new Date().toISOString(), status: "pending_approval", role: "user" })
      .eq("email", normalizedEmail);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (userId) {
      const { data: pendingRequest } = await admin
        .from("approval_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("request_status", "pending")
        .maybeSingle();

      if (!pendingRequest?.id) {
        await admin.from("approval_requests").insert({
          user_id: userId,
          request_status: "pending",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      approved: false,
      message: "OTP verified. You can login now. Auto approval will complete in 1-2 minutes.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
