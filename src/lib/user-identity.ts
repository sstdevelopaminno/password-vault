import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeEmail(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase();
}

export async function resolveAccessibleUserIds(input: {
  admin: SupabaseClient;
  authUserId: string;
  authEmail?: string | null;
}) {
  const authUserId = String(input.authUserId ?? "").trim();
  if (!authUserId) return [];

  const ids = [authUserId];
  const email = normalizeEmail(input.authEmail);
  if (!email) return ids;

  const query = await input.admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (query.error || !query.data?.id) return ids;

  const profileId = String(query.data.id).trim();
  if (profileId && !ids.includes(profileId)) {
    ids.push(profileId);
  }
  return ids;
}

export function pickPrimaryUserId(input: { authUserId: string; accessibleUserIds: string[] }) {
  const authUserId = String(input.authUserId ?? "").trim();
  const ids = Array.from(
    new Set(
      (input.accessibleUserIds ?? [])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );
  const legacyProfileId = ids.find((id) => id !== authUserId);
  return legacyProfileId ?? authUserId ?? ids[0] ?? "";
}
