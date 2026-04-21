import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACTIVE_SESSION_COOKIE,
  getSharedCookieOptions,
} from "@/lib/session-security";
import { clearVaultRiskPolicyCookie } from "@/lib/vault-risk-policy";

export async function POST() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const currentSessionToken = cookieStore.get(ACTIVE_SESSION_COOKIE)?.value ?? "";

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user && currentSessionToken) {
    const appMetadata =
      authData.user.app_metadata && typeof authData.user.app_metadata === "object"
        ? ({ ...authData.user.app_metadata } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const activeToken =
      typeof appMetadata.pv_active_session === "string"
        ? appMetadata.pv_active_session
        : "";

    if (activeToken && activeToken === currentSessionToken) {
      delete appMetadata.pv_active_session;
      delete appMetadata.pv_active_updated_at;

      const admin = createAdminClient();
      const { error: metaError } = await admin.auth.admin.updateUserById(authData.user.id, {
        app_metadata: appMetadata,
      });

      if (metaError) {
        console.error("Failed clearing active session metadata on logout:", metaError.message);
      }
    }
  }

  const { error } = await supabase.auth.signOut({ scope: "local" });
  const response = error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });

  response.cookies.set({
    name: ACTIVE_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: 0,
  });
  clearVaultRiskPolicyCookie(response);

  return response;
}
