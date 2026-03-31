import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  isOtpSendConstraintError,
  parseRetryAfterSeconds,
  sendSignupResendOtpViaFallback,
} from "@/lib/otp-delivery";

const schema = z.object({ email: z.email() });

export async function POST(req: Request) {
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {}

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const ip = clientIp(req);
  const limit = takeRateLimit(`resend-signup-otp:${ip}:${normalizedEmail}`, { limit: 2, windowMs: 60 * 1000 });

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "OTP rate limited. Please wait.",
        retryAfterSec: limit.retryAfterSec,
      },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizedEmail,
  });

  if (error) {
    if (!isOtpSendConstraintError(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const fallback = await sendSignupResendOtpViaFallback(normalizedEmail);
    if (fallback.ok) {
      return NextResponse.json({
        ok: true,
        retryAfterSec: fallback.retryAfterSec,
        channel: fallback.channel,
        message: "OTP sent to your email",
      });
    }

    return NextResponse.json(
      {
        error: "OTP rate limited. Please wait.",
        retryAfterSec: fallback.retryAfterSec || parseRetryAfterSeconds(error.message) || 60,
        details: fallback.error ?? error.message,
      },
      { status: 429 },
    );
  }

  return NextResponse.json({
    ok: true,
    retryAfterSec: 60,
    channel: "supabase",
    message: "OTP sent to your email",
  });
}
