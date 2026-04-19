import { NextResponse } from "next/server";
import { createAdminClient, findAuthUserByEmail, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { z } from "zod";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (!z.email().safeParse(normalizedEmail).success) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = await takeRateLimit(`find-account:${ip}:${normalizedEmail}`, { limit: 10, windowMs: 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait.", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const admin = createAdminClient();
  const profileByEmail = await admin
    .from("profiles")
    .select("id,email,status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileByEmail.error) {
    return NextResponse.json({ error: profileByEmail.error.message }, { status: 500 });
  }

  if (profileByEmail.data?.id) {
    if (profileByEmail.data.status !== "active") {
      return NextResponse.json({ error: "Account is not approved yet" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, email: normalizedEmail });
  }

  const authUser = await findAuthUserByEmail(normalizedEmail);
  if (!authUser?.id) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const resolved = await resolveProfileForAuthUser({
      userId: authUser.id,
      email: authUser.email,
      fullName: "",
    });

    if (resolved.profile.status !== "active") {
      return NextResponse.json({ error: "Account is not approved yet" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, email: normalizedEmail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve account";
    if (message.toLowerCase().includes("linked to another account")) {
      return NextResponse.json({ error: "Account profile mismatch. Please contact admin." }, { status: 409 });
    }
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
    return NextResponse.json({ ok: true, email: normalizedEmail });
  }
}
