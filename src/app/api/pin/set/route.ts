import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { createClient } from "@/lib/supabase/server";
import { hashPin, verifyPin } from "@/lib/pin";
import { pinSetSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";

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
    const body = await req.json();
    const parsed = pinSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid PIN payload" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: auth } = await withTimeout(supabase.auth.getUser(), 8000, "Supabase auth timeout");
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userEmail = String(auth.user.email ?? "").toLowerCase();
    const userName = String(auth.user.user_metadata?.full_name ?? "User");
    const admin = createAdminClient();

    const resolved = await withTimeout(
      resolveProfileForAuthUser({
        userId: auth.user.id,
        email: userEmail,
        fullName: userName,
      }),
      8000,
      "Supabase profile resolve timeout",
    );

    const targetProfileId = String(resolved.profile.id);
    const targetProfilePinHash = String(resolved.profile.pin_hash ?? "");
    const hadExistingPin = Boolean(targetProfilePinHash);

    if (hadExistingPin) {
      if (!parsed.data.currentPin) {
        return NextResponse.json({ error: "Current PIN is required" }, { status: 400 });
      }

      if (!(await verifyPin(parsed.data.currentPin, targetProfilePinHash))) {
        void logAudit("pin_change_failed", { reason: "invalid_current_pin", source: resolved.source }).catch(() => {});
        return NextResponse.json({ error: "Current PIN is invalid" }, { status: 403 });
      }
    }

    const nextHash = await hashPin(parsed.data.newPin);

    const { error: updateError } = await withTimeout(
      admin.from("profiles").update({ pin_hash: nextHash }).eq("id", targetProfileId),
      8000,
      "Supabase update timeout",
    );
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (userEmail) {
      const { error: syncByEmailError } = await withTimeout(
        admin.from("profiles").update({ pin_hash: nextHash }).eq("email", userEmail),
        8000,
        "Supabase update-by-email timeout",
      );
      if (syncByEmailError) {
        console.error("PIN sync by email failed:", syncByEmailError.message);
      }
    }

    void logAudit("pin_changed", { firstTime: !hadExistingPin, source: resolved.source }).catch(() => {});
    return NextResponse.json({ ok: true, firstTime: !hadExistingPin });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "PIN update failed" }, { status: 500 });
  }
}
