import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.email() });

function parseRetryAfterSeconds(message: string) {
  const text = String(message ?? "");
  const match = text.match(/after\s+(\d+)\s*seconds?/i);
  if (!match) return 0;
  const sec = Number(match[1]);
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

function isRateLimitErrorMessage(message: string) {
  const lower = String(message ?? "").toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("for security purposes") ||
    lower.includes("request this after") ||
    lower.includes("over_email_send_rate_limit")
  );
}

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
    if (isRateLimitErrorMessage(error.message)) {
      return NextResponse.json(
        { error: "OTP rate limited. Please wait.", retryAfterSec: parseRetryAfterSeconds(error.message) || 60 },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    retryAfterSec: 60,
    message: "OTP sent to your email",
  });
}
