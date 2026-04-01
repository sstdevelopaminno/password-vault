import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validators";
import { createAdminClient, findAuthUserByEmail, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isOtpProviderConfigError,
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
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();
      const existingAuthUser = await findAuthUserByEmail(normalizedEmail);

      if (existingProfile?.id || existingAuthUser?.id) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { full_name: fullName } },
      });

      if (signUpError) {
        if (isAlreadyRegisteredError(signUpError.message)) {
          return NextResponse.json({ error: "Email already registered" }, { status: 409 });
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

        const retryAfter = fallback.retryAfterSec || parseRetryAfterSeconds(signUpError.message) || 60;
        const fallbackError = String(fallback.error ?? "");

        if (isOtpProviderConfigError(fallbackError)) {
          console.error("OTP fallback provider misconfigured in register signup:", fallbackError);
          return NextResponse.json(
            { error: "OTP delivery service unavailable. Please try again shortly." },
            { status: 503 },
          );
        }

        if (isOtpSendConstraintError(fallbackError)) {
          return NextResponse.json(
            {
              error: "OTP rate limited. Please wait.",
              retryAfterSec: retryAfter,
            },
            { status: 429 },
          );
        }

        console.error("OTP fallback delivery failed in register signup:", fallbackError);
        return NextResponse.json(
          { error: "Unable to send OTP right now. Please try again shortly." },
          { status: 502 },
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

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unable to resolve verified user session" }, { status: 401 });
    }

    const resolved = await resolveProfileForAuthUser({
      userId: user.id,
      email: String(user.email ?? normalizedEmail),
      fullName: String(user.user_metadata?.full_name ?? fullName),
    });

    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({
        email_verified_at: new Date().toISOString(),
        status: "pending_approval",
        role: resolved.profile.role === "pending" ? "user" : resolved.profile.role,
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
