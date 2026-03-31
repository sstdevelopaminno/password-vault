import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { createClient } from "@/lib/supabase/server";
import { hashPin, verifyPin } from "@/lib/pin";
import { pinSetSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

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

function isDuplicateEmailConstraintError(message: unknown) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("duplicate key value") && text.includes("profiles_email_key");
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

    const userId = auth.user.id;
    const userEmail = auth.user.email?.toLowerCase() ?? "";
    const userName = String(auth.user.user_metadata?.full_name ?? "User");

    const admin = createAdminClient();

    const { data: profileById, error: profileError } = await withTimeout(
      admin.from("profiles").select("id,pin_hash").eq("id", userId).maybeSingle(),
      8000,
      "Supabase profile timeout",
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    let targetProfileId = String(profileById?.id ?? "");
    let targetProfilePinHash = String(profileById?.pin_hash ?? "");

    if (!targetProfileId && userEmail) {
      const { data: profileByEmail, error: profileByEmailError } = await withTimeout(
        admin.from("profiles").select("id,pin_hash").eq("email", userEmail).maybeSingle(),
        8000,
        "Supabase profile-by-email timeout",
      );

      if (profileByEmailError) {
        return NextResponse.json({ error: profileByEmailError.message }, { status: 400 });
      }

      if (profileByEmail?.id) {
        targetProfileId = String(profileByEmail.id);
        targetProfilePinHash = String(profileByEmail.pin_hash ?? "");
      }
    }

    const hadExistingPin = Boolean(targetProfilePinHash);

    if (hadExistingPin) {
      if (!parsed.data.currentPin) {
        return NextResponse.json({ error: "Current PIN is required" }, { status: 400 });
      }

      if (!(await verifyPin(parsed.data.currentPin, targetProfilePinHash))) {
        void logAudit("pin_change_failed", { reason: "invalid_current_pin" }).catch(() => {});
        return NextResponse.json({ error: "Current PIN is invalid" }, { status: 403 });
      }
    }

    const nextHash = await hashPin(parsed.data.newPin);

    if (targetProfileId) {
      const { error: updateError } = await withTimeout(
        admin.from("profiles").update({ pin_hash: nextHash }).eq("id", targetProfileId),
        8000,
        "Supabase update timeout",
      );
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    } else {
      const { error: insertError } = await withTimeout(
        admin.from("profiles").insert({
          id: userId,
          email: userEmail,
          full_name: userName,
          role: "user",
          status: "active",
          pin_hash: nextHash,
        }),
        8000,
        "Supabase insert timeout",
      );

      if (insertError) {
        if (isDuplicateEmailConstraintError(insertError.message) && userEmail) {
          const { error: updateByEmailError } = await withTimeout(
            admin.from("profiles").update({ pin_hash: nextHash }).eq("email", userEmail),
            8000,
            "Supabase update-by-email timeout",
          );
          if (!updateByEmailError) {
            void logAudit("pin_changed", { firstTime: true, repairedByEmail: true }).catch(() => {});
            return NextResponse.json({ ok: true, firstTime: true });
          }
          return NextResponse.json({ error: updateByEmailError.message }, { status: 400 });
        }

        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    }

    void logAudit("pin_changed", { firstTime: !hadExistingPin }).catch(() => {});
    return NextResponse.json({ ok: true, firstTime: !hadExistingPin });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "PIN update failed" }, { status: 500 });
  }
}


