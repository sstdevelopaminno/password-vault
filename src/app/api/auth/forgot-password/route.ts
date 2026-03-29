import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

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
    const lower = String(error.message).toLowerCase();
    if (lower.includes("rate limit")) {
      return NextResponse.json({ error: "OTP rate limited. Please wait.", retryAfterSec: 60 }, { status: 429 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email: normalizedEmail, message: "OTP sent for password reset" });
}
