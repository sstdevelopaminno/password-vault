import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { email, otp } = parsed.data;
  const verified = await supabase.auth.verifyOtp({
    email: email.toLowerCase(),
    token: otp,
    type: "email",
  });

  if (verified.error || !verified.data.user) {
    const recoveryTry = await supabase.auth.verifyOtp({
      email: email.toLowerCase(),
      token: otp,
      type: "recovery",
    });

    if (recoveryTry.error || !recoveryTry.data.user) {
      return NextResponse.json({ error: verified.error?.message ?? "Invalid OTP" }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
