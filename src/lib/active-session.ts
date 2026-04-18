import { createAdminClient } from "@/lib/supabase/admin";
import { createActiveSessionToken } from "@/lib/session-security";

export async function bindActiveSession(userId: string, appMetadata: unknown) {
  const admin = createAdminClient();
  const token = createActiveSessionToken();
  const nextMetadata =
    appMetadata && typeof appMetadata === "object"
      ? { ...(appMetadata as Record<string, unknown>) }
      : ({} as Record<string, unknown>);

  nextMetadata.pv_active_session = token;
  nextMetadata.pv_active_updated_at = new Date().toISOString();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMetadata,
  });

  return { token, error };
}

export function getActiveSessionMetadataToken(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object") {
    return "";
  }

  const record = appMetadata as Record<string, unknown>;
  return typeof record.pv_active_session === "string" ? String(record.pv_active_session) : "";
}
