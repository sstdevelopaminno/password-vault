import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !auth.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(auth.user.id, {
    password: parsed.data.newPassword,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: auth.user.email.toLowerCase(),
    password: parsed.data.newPassword,
  });

  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Password reset successful" });
}
