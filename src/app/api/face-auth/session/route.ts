import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { verifyFacePinSessionToken } from "@/lib/face-auth";
import { ACTIVE_SESSION_COOKIE, FACE_PIN_SESSION_COOKIE, hasSupabaseAuthCookie } from "@/lib/session-security";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (!auth.user) {
    const cookieStore = await cookies();
    const recoverableAuthState = Boolean(authError && hasSupabaseAuthCookie(cookieStore.getAll()));
    if (recoverableAuthState) {
      return NextResponse.json(
        { error: "Session synchronization in progress", recoverable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });

  const requiresFacePin = Boolean(
    resolved.profile.face_auth_enabled &&
      resolved.profile.face_enrolled_at &&
      resolved.profile.pin_hash,
  );

  if (!requiresFacePin) {
    return NextResponse.json({
      ok: true,
      required: false,
      verified: true,
      faceEnrolledAt: resolved.profile.face_enrolled_at ?? null,
    });
  }

  const admin = createAdminClient();
  const biometric = await admin
    .from("user_face_biometrics")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (biometric.error) {
    return NextResponse.json({ error: biometric.error.message }, { status: 400 });
  }
  if (!biometric.data?.user_id) {
    return NextResponse.json({
      ok: true,
      required: false,
      verified: true,
      faceEnrolledAt: null,
    });
  }

  const cookieStore = await cookies();
  const activeSessionToken = String(cookieStore.get(ACTIVE_SESSION_COOKIE)?.value ?? "");
  const faceSessionToken = String(cookieStore.get(FACE_PIN_SESSION_COOKIE)?.value ?? "");
  const verified = verifyFacePinSessionToken(faceSessionToken, {
    userId: auth.user.id,
    activeSession: activeSessionToken,
  });

  return NextResponse.json({
    ok: true,
    required: true,
    verified,
    faceEnrolledAt: resolved.profile.face_enrolled_at ?? null,
  });
}
