import { NextResponse } from "next/server";
import { createAdminClient, findAuthUserByEmail, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { z } from "zod";

export async function POST(req: Request) {
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (!z.email().safeParse(normalizedEmail).success) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
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
    return NextResponse.json({ ok: true, email: normalizedEmail });
  }
}
