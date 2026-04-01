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
};

function isDuplicateEmailConstraintError(message: unknown) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("duplicate key value") && text.includes("profiles_email_key");
}

export async function resolveProfileForAuthUser(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
}): Promise<{ profile: ResolvedAuthProfile; source: "id" | "email" | "created" }> {
  const admin = createAdminClient();
  const normalizedEmail = String(input.email ?? "").trim().toLowerCase();
  const fallbackName = String(input.fullName ?? "").trim() || "User";

  const byId = await admin
    .from("profiles")
    .select("id,email,full_name,role,status,pin_hash")
    .eq("id", input.userId)
    .maybeSingle();
  if (byId.error) throw new Error(byId.error.message);
  if (byId.data?.id) {
    return { profile: byId.data as ResolvedAuthProfile, source: "id" };
  }

  if (normalizedEmail) {
    const byEmail = await admin
      .from("profiles")
      .select("id,email,full_name,role,status,pin_hash")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (byEmail.error) throw new Error(byEmail.error.message);
    if (byEmail.data?.id) {
      return { profile: byEmail.data as ResolvedAuthProfile, source: "email" };
    }
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
    .select("id,email,full_name,role,status,pin_hash")
    .maybeSingle();

  if (inserted.error) {
    if (isDuplicateEmailConstraintError(inserted.error.message)) {
      const retryByEmail = await admin
        .from("profiles")
        .select("id,email,full_name,role,status,pin_hash")
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
