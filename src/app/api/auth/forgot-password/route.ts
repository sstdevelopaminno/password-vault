import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

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
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (!z.email().safeParse(normalizedEmail).success) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = takeRateLimit(`forgot-password:${ip}:${normalizedEmail}`, { limit: 3, windowMs: 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "OTP rate limited. Please wait.", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,email,status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (profile.status !== "active") {
    return NextResponse.json({ error: "Account is not approved yet" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
    },
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

  return NextResponse.json({ ok: true, email: normalizedEmail, retryAfterSec: 60, message: "OTP sent for password reset" });
}
