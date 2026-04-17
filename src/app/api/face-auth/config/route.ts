import { NextResponse } from "next/server";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });

  const admin = createAdminClient();
  const biometric = await admin
    .from("user_face_biometrics")
    .select("user_id,enrolled_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (biometric.error) {
    return NextResponse.json({ error: biometric.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    faceAuthEnabled: Boolean(resolved.profile.face_auth_enabled),
    faceEnrolled: Boolean(biometric.data?.user_id),
    faceEnrolledAt: biometric.data?.enrolled_at ?? resolved.profile.face_enrolled_at ?? null,
    hasPin: Boolean(resolved.profile.pin_hash),
  });
}
