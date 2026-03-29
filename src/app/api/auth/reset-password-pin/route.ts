import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/pin";

const resetByPinSchema = z.object({
  email: z.email(),
  pin: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = resetByPinSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { pin, newPassword } = parsed.data;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,email,status,pin_hash")
    .eq("email", email)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (profile.status !== "active") {
    return NextResponse.json({ error: "Account is not approved yet" }, { status: 403 });
  }

  if (!profile.pin_hash) {
    return NextResponse.json({ error: "PIN is not set for this account" }, { status: 400 });
  }

  const validPin = await verifyPin(pin, profile.pin_hash);
  if (!validPin) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password: newPassword,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: newPassword,
  });

  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Password reset successful" });
}
