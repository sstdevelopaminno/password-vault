import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = resetPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { email, otp, newPassword } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: otp,
    type: "email",
  });

  if (verified.error || !verified.data.user) {
    return NextResponse.json({ error: verified.error?.message ?? "Invalid OTP" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(verified.data.user.id, {
    password: newPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: newPassword,
  });

  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Password reset successful" });
}
