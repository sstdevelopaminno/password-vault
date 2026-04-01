import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Missing Supabase admin credentials");
  }

  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type ResolvedAuthProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "pending" | "user" | "approver" | "admin" | "super_admin";
  status: "pending_approval" | "active" | "disabled";
  pin_hash: string | null;
  email_verified_at: string | null;
};

function isDuplicateEmailConstraintError(message: unknown) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("duplicate key value") && text.includes("profiles_email_key");
}

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

export async function resolveProfileForAuthUser(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
}): Promise<{ profile: ResolvedAuthProfile; source: "id" | "email" | "created" }> {
  const admin = createAdminClient();
  const normalizedEmail = normalizeEmail(input.email);
  const fallbackName = String(input.fullName ?? "").trim() || "User";

  const byId = await admin
    .from("profiles")
    .select("id,email,full_name,role,status,pin_hash,email_verified_at")
    .eq("id", input.userId)
    .maybeSingle();
  if (byId.error) throw new Error(byId.error.message);

  let byEmailData: ResolvedAuthProfile | null = null;
  if (normalizedEmail) {
    const byEmail = await admin
      .from("profiles")
      .select("id,email,full_name,role,status,pin_hash,email_verified_at")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (byEmail.error) throw new Error(byEmail.error.message);
    byEmailData = (byEmail.data as ResolvedAuthProfile | null) ?? null;
  }

  const byIdData = (byId.data as ResolvedAuthProfile | null) ?? null;
  if (byIdData && byEmailData && byIdData.id !== byEmailData.id) {
    const byIdMatchesAuthEmail = normalizeEmail(byIdData.email) === normalizedEmail;
    const byIdHasPin = Boolean(byIdData.pin_hash);
    const byEmailHasPin = Boolean(byEmailData.pin_hash);
    const shouldPreferEmail = !byIdMatchesAuthEmail || (!byIdHasPin && byEmailHasPin);

    if (shouldPreferEmail) {
      return { profile: byEmailData, source: "email" };
    }
  }

  if (byIdData?.id) {
    return { profile: byIdData, source: "id" };
  }

  if (byEmailData?.id) {
    return { profile: byEmailData, source: "email" };
  }

  if (!normalizedEmail) {
    throw new Error("Profile not found and user email is unavailable");
  }

  const inserted = await admin
    .from("profiles")
    .insert({
      id: input.userId,
      email: normalizedEmail,
      full_name: fallbackName,
      role: "pending",
      status: "pending_approval",
    })
    .select("id,email,full_name,role,status,pin_hash,email_verified_at")
    .maybeSingle();

  if (inserted.error) {
    if (isDuplicateEmailConstraintError(inserted.error.message)) {
      const retryByEmail = await admin
        .from("profiles")
        .select("id,email,full_name,role,status,pin_hash,email_verified_at")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (retryByEmail.error) throw new Error(retryByEmail.error.message);
      if (retryByEmail.data?.id) {
        return { profile: retryByEmail.data as ResolvedAuthProfile, source: "email" };
      }
    }
    throw new Error(inserted.error.message);
  }

  if (!inserted.data?.id) {
    throw new Error("Profile creation failed");
  }

  return { profile: inserted.data as ResolvedAuthProfile, source: "created" };
}
