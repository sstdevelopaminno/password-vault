import { NextResponse } from "next/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { faceEnrollSchema } from "@/lib/validators";
import { verifyPinAssertionToken } from "@/lib/pin";
import { buildStoredFaceTemplate } from "@/lib/face-auth";
import { encryptText } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { FACE_PIN_SESSION_COOKIE, getSharedCookieOptions } from "@/lib/session-security";

export const runtime = "nodejs";

function parseAssertionToken(req: Request) {
  return String(req.headers.get("x-pin-assertion") ?? "");
}

function requirePinAssertion(assertionToken: string, userId: string) {
  if (!assertionToken) return false;
  return verifyPinAssertionToken(assertionToken, {
    userId,
    action: "unlock_app",
  });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = faceEnrollSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid enrollment payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assertionToken = parseAssertionToken(req);
  if (!requirePinAssertion(assertionToken, auth.user.id)) {
    return NextResponse.json({ error: "PIN verification required" }, { status: 403 });
  }

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });
  if (!resolved.profile.pin_hash) {
    return NextResponse.json({ error: "Set PIN before enrolling face login" }, { status: 400 });
  }

  const template = buildStoredFaceTemplate(parsed.data.samples);
  const nowIso = new Date().toISOString();
  const admin = createAdminClient();

  const upsert = await admin.from("user_face_biometrics").upsert(
    {
      user_id: auth.user.id,
      template_encrypted: encryptText(JSON.stringify(template)),
      template_version: template.version,
      enrollment_source: "settings_camera",
      enrolled_at: nowIso,
      updated_at: nowIso,
      failed_attempts: 0,
      locked_until: null,
    },
    { onConflict: "user_id" },
  );

  if (upsert.error) {
    return NextResponse.json({ error: upsert.error.message }, { status: 400 });
  }

  const profileUpdate = await admin
    .from("profiles")
    .update({ face_enrolled_at: nowIso })
    .eq("id", auth.user.id);
  if (profileUpdate.error) {
    return NextResponse.json({ error: profileUpdate.error.message }, { status: 400 });
  }

  void logAudit("face_auth_enrolled", {
    actor_user_id: auth.user.id,
    sample_count: template.vectors.length,
    quality_score: template.qualityScore,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    sampleCount: template.vectors.length,
    faceEnrolledAt: nowIso,
    message: "Face enrollment completed.",
  });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assertionToken = parseAssertionToken(req);
  if (!requirePinAssertion(assertionToken, auth.user.id)) {
    return NextResponse.json({ error: "PIN verification required" }, { status: 403 });
  }

  const admin = createAdminClient();
  const remove = await admin
    .from("user_face_biometrics")
    .delete()
    .eq("user_id", auth.user.id);

  if (remove.error) {
    return NextResponse.json({ error: remove.error.message }, { status: 400 });
  }

  const profileUpdate = await admin
    .from("profiles")
    .update({ face_auth_enabled: false, face_enrolled_at: null })
    .eq("id", auth.user.id);

  if (profileUpdate.error) {
    return NextResponse.json({ error: profileUpdate.error.message }, { status: 400 });
  }

  void logAudit("face_auth_removed", {
    actor_user_id: auth.user.id,
  }).catch(() => {});

  const response = NextResponse.json({ ok: true, message: "Face enrollment deleted." });
  response.cookies.set({
    name: FACE_PIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: 0,
  });
  return response;
}
