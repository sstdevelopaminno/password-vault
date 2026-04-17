import { NextResponse } from "next/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { faceToggleSchema } from "@/lib/validators";
import { verifyPinAssertionToken } from "@/lib/pin";
import { logAudit } from "@/lib/audit";
import { FACE_PIN_SESSION_COOKIE, getSharedCookieOptions } from "@/lib/session-security";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = faceToggleSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assertionToken = String(req.headers.get("x-pin-assertion") ?? "");
  if (!assertionToken) {
    return NextResponse.json({ error: "PIN verification required" }, { status: 403 });
  }

  const pinVerified = verifyPinAssertionToken(assertionToken, {
    userId: auth.user.id,
    action: "unlock_app",
  });
  if (!pinVerified) {
    return NextResponse.json({ error: "Invalid PIN verification" }, { status: 403 });
  }

  const admin = createAdminClient();
  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });

  if (parsed.data.enabled) {
    if (!resolved.profile.pin_hash) {
      return NextResponse.json({ error: "Set PIN before enabling face login" }, { status: 400 });
    }

    const biometric = await admin
      .from("user_face_biometrics")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (biometric.error) {
      return NextResponse.json({ error: biometric.error.message }, { status: 400 });
    }
    if (!biometric.data?.user_id) {
      return NextResponse.json({ error: "Face enrollment is required before enabling" }, { status: 400 });
    }
  }

  const update = await admin
    .from("profiles")
    .update({ face_auth_enabled: parsed.data.enabled })
    .eq("id", auth.user.id);

  if (update.error) {
    return NextResponse.json({ error: update.error.message }, { status: 400 });
  }

  void logAudit("face_auth_toggled", {
    actor_user_id: auth.user.id,
    enabled: parsed.data.enabled,
  }).catch(() => {});

  const response = NextResponse.json({
    ok: true,
    enabled: parsed.data.enabled,
    message: parsed.data.enabled ? "Face login enabled." : "Face login disabled.",
  });

  if (!parsed.data.enabled) {
    response.cookies.set({
      name: FACE_PIN_SESSION_COOKIE,
      value: "",
      httpOnly: true,
      ...getSharedCookieOptions(),
      maxAge: 0,
    });
  }

  return response;
}
