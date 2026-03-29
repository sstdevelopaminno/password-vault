import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { pinVerifySchema } from "@/lib/validators";
import { createClient } from "@/lib/supabase/server";
import { createPinAssertionToken, verifyPin } from "@/lib/pin";
import { logAudit } from "@/lib/audit";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

async function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promiseLike),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  try {
    if (req.headers.get("x-pin-preload") === "1") {
      return NextResponse.json({ ok: true, preloaded: true });
    }

    const payload = await req.json();
    const parsed = pinVerifySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid PIN request" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data } = await withTimeout(supabase.auth.getUser(), 8000, "Supabase auth timeout");
    if (!data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = clientIp(req);
    const limit = takeRateLimit(`pin-verify:${ip}:${data.user.id}`, { limit: 12, windowMs: 60 * 1000 });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many PIN attempts. Please wait.", retryAfterSec: limit.retryAfterSec }, { status: 429 });
    }

    const { data: profile, error: profileError } = await withTimeout(
      supabase.from("profiles").select("pin_hash").eq("id", data.user.id).maybeSingle(),
      8000,
      "Supabase profile timeout",
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    if (!profile?.pin_hash || !(await verifyPin(parsed.data.pin, profile.pin_hash))) {
      void logAudit("pin_verify_failed", {
        action: parsed.data.action,
        targetItemId: parsed.data.targetItemId ?? null,
        ip,
      }).catch(() => {});

      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    const assertionToken = createPinAssertionToken({
      userId: data.user.id,
      action: parsed.data.action,
      targetItemId: parsed.data.targetItemId,
    });

    void logAudit("pin_verified", {
      action: parsed.data.action,
      targetItemId: parsed.data.targetItemId ?? null,
      ip,
    }).catch(() => {});

    return NextResponse.json({ ok: true, assertionToken });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "PIN verify failed" }, { status: 500 });
  }
}
