import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findAuthUserByEmail, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { z } from "zod";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  isOtpProviderConfigError,
  isOtpSendConstraintError,
  parseRetryAfterSeconds,
  sendRecoveryOtpViaFallback,
} from "@/lib/otp-delivery";

export async function POST(req: Request) {
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (!z.email().safeParse(normalizedEmail).success) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = await takeRateLimit(`forgot-password:${ip}:${normalizedEmail}`, { limit: 3, windowMs: 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "OTP rate limited. Please wait.", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const authUser = await findAuthUserByEmail(normalizedEmail);
  if (!authUser?.id) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const resolved = await resolveProfileForAuthUser({
    userId: authUser.id,
    email: authUser.email,
    fullName: "",
  });

  if (resolved.profile.status !== "active") {
    return NextResponse.json({ error: "Account is not approved yet" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: authUser.email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    if (!isOtpSendConstraintError(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const fallback = await sendRecoveryOtpViaFallback(authUser.email);
    if (fallback.ok) {
      return NextResponse.json({
        ok: true,
        email: authUser.email,
        retryAfterSec: fallback.retryAfterSec,
        channel: fallback.channel,
        message: "OTP sent for password reset",
      });
    }

    if (isOtpProviderConfigError(fallback.error ?? "")) {
      console.error("OTP fallback provider misconfigured in forgot-password:", fallback.error);
      return NextResponse.json(
        { error: "OTP delivery service unavailable. Please try again shortly." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "OTP rate limited. Please wait.",
        retryAfterSec: fallback.retryAfterSec || parseRetryAfterSeconds(error.message) || 60,
      },
      { status: 429 },
    );
  }

  return NextResponse.json({
    ok: true,
    email: authUser.email,
    retryAfterSec: 60,
    channel: "supabase",
    message: "OTP sent for password reset",
  });
}

