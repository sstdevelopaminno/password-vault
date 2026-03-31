import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validators";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isOtpSendConstraintError,
  parseRetryAfterSeconds,
  sendSignupOtpViaFallback,
} from "@/lib/otp-delivery";

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
        if (isAlreadyRegisteredError(signUpError.message)) {
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

          if (!resend.error) {
            return NextResponse.json({
              ok: true,
              otpRequired: true,
              retryAfterSec: 60,
              channel: "supabase",
              message: "OTP sent to your email",
            });
          }

          if (!isOtpSendConstraintError(resend.error.message)) {
            return NextResponse.json({ error: resend.error.message }, { status: 400 });
          }

          const fallback = await sendSignupOtpViaFallback({
            email: normalizedEmail,
            password,
            fullName,
          });

          if (fallback.ok) {
            return NextResponse.json({
              ok: true,
              otpRequired: true,
              retryAfterSec: fallback.retryAfterSec,
              channel: fallback.channel,
              message: "OTP sent to your email",
            });
          }

          const retryAfter = fallback.retryAfterSec || parseRetryAfterSeconds(resend.error.message) || 60;
          return NextResponse.json(
            {
              error: "OTP rate limited. Please wait.",
              retryAfterSec: retryAfter,
              details: fallback.error ?? resend.error.message,
            },
            { status: 429 },
          );
        }

        if (!isOtpSendConstraintError(signUpError.message)) {
          return NextResponse.json({ error: signUpError.message }, { status: 400 });
        }

        const fallback = await sendSignupOtpViaFallback({
          email: normalizedEmail,
          password,
          fullName,
        });

        if (fallback.ok) {
          return NextResponse.json({
            ok: true,
            otpRequired: true,
            retryAfterSec: fallback.retryAfterSec,
            channel: fallback.channel,
            message: "OTP sent to your email",
          });
        }

        return NextResponse.json(
          {
            error: "OTP rate limited. Please wait.",
            retryAfterSec: fallback.retryAfterSec || parseRetryAfterSeconds(signUpError.message) || 60,
            details: fallback.error ?? signUpError.message,
          },
          { status: 429 },
        );
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

      return NextResponse.json({
        ok: true,
        otpRequired: true,
        retryAfterSec: 60,
        channel: "supabase",
        message: "OTP sent to your email",
      });
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
    if (isOtpSendConstraintError(message)) {
      const retryAfterSec = parseRetryAfterSeconds(message) || 60;
      return NextResponse.json({ error: "OTP rate limited. Please wait.", retryAfterSec }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
