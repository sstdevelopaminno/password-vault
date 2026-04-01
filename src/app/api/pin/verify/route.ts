import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { pinVerifySchema } from "@/lib/validators";
import { createClient } from "@/lib/supabase/server";
import { createPinAssertionToken, verifyPin } from "@/lib/pin";
import { logAudit } from "@/lib/audit";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";

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

    const resolved = await withTimeout(
      resolveProfileForAuthUser({
        userId: data.user.id,
        email: data.user.email ?? "",
        fullName: String(data.user.user_metadata?.full_name ?? ""),
      }),
      8000,
      "Supabase profile timeout",
    );

    const pinHash = String(resolved.profile.pin_hash ?? "");
    if (!pinHash || !(await verifyPin(parsed.data.pin, pinHash))) {
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
      profileSource: resolved.source,
      profileId: resolved.profile.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, assertionToken });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "PIN verify failed" }, { status: 500 });
  }
}
