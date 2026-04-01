import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, findAuthUserByEmail } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  email: z.email(),
});

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const authUser = await findAuthUserByEmail(normalizedEmail);
    if (authUser?.id) {
      return NextResponse.json({
        ok: true,
        exists: true,
      });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      exists: Boolean(data?.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
