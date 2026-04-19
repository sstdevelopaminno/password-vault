import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, findAuthUserByEmail } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

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
    const ip = clientIp(req);
    const limit = await takeRateLimit(`check-register-email:${ip}:${normalizedEmail}`, { limit: 20, windowMs: 60 * 1000 });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests. Please wait.", retryAfterSec: limit.retryAfterSec }, { status: 429 });
    }

    const admin = createAdminClient();
    const profileQuery = await admin.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle();
    if (profileQuery.error) {
      return NextResponse.json({ error: profileQuery.error.message }, { status: 500 });
    }
    if (profileQuery.data?.id) {
      return NextResponse.json({
        ok: true,
        exists: true,
      });
    }

    const authUser = await findAuthUserByEmail(normalizedEmail);
    if (authUser?.id) {
      return NextResponse.json({
        ok: true,
        exists: true,
      });
    }

    return NextResponse.json({
      ok: true,
      exists: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
