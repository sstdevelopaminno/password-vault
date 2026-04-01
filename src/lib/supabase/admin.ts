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

export type AuthUserSummary = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  banned_until: string | null;
  last_sign_in_at: string | null;
};

function isDuplicateEmailConstraintError(message: unknown) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("duplicate key value") && text.includes("profiles_email_key");
}

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const admin = createAdminClient();
  const perPage = 1000;

  for (let page = 1; page <= 50; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) throw new Error(listed.error.message);

    const users = listed.data?.users ?? [];
    const matched = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail);
    if (matched) {
      return {
        id: String(matched.id),
        email: String(matched.email ?? ""),
        email_confirmed_at: matched.email_confirmed_at ? String(matched.email_confirmed_at) : null,
        banned_until: matched.banned_until ? String(matched.banned_until) : null,
        last_sign_in_at: matched.last_sign_in_at ? String(matched.last_sign_in_at) : null,
      };
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
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

  const byIdData = (byId.data as ResolvedAuthProfile | null) ?? null;
  if (byIdData?.id) {
    if (normalizedEmail && normalizeEmail(byIdData.email) !== normalizedEmail) {
      const emailConflict = await admin
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .neq("id", input.userId)
        .maybeSingle();

      if (emailConflict.error) throw new Error(emailConflict.error.message);
      if (!emailConflict.data?.id) {
        const synced = await admin
          .from("profiles")
          .update({ email: normalizedEmail })
          .eq("id", input.userId)
          .select("id,email,full_name,role,status,pin_hash,email_verified_at")
          .maybeSingle();

        if (synced.error) throw new Error(synced.error.message);
        if (synced.data?.id) {
          return { profile: synced.data as ResolvedAuthProfile, source: "id" };
        }
      }
    }

    return { profile: byIdData, source: "id" };
  }

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

  if (byEmailData?.id) {
    if (byEmailData.id === input.userId) {
      return { profile: byEmailData, source: "email" };
    }

    const ownerAuth = await admin.auth.admin.getUserById(byEmailData.id);
    if (ownerAuth.error) throw new Error(ownerAuth.error.message);

    const ownerAuthEmail = normalizeEmail(ownerAuth.data?.user?.email);
    if (!ownerAuthEmail || ownerAuthEmail === normalizedEmail) {
      throw new Error("Profile email is linked to another account");
    }

    const repair = await admin
      .from("profiles")
      .update({ email: ownerAuthEmail })
      .eq("id", byEmailData.id);
    if (repair.error) throw new Error(repair.error.message);
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
      const retryById = await admin
        .from("profiles")
        .select("id,email,full_name,role,status,pin_hash,email_verified_at")
        .eq("id", input.userId)
        .maybeSingle();
      if (retryById.error) throw new Error(retryById.error.message);
      if (retryById.data?.id) {
        return { profile: retryById.data as ResolvedAuthProfile, source: "id" };
      }

      const retryByEmail = await admin
        .from("profiles")
        .select("id,email,full_name,role,status,pin_hash,email_verified_at")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (retryByEmail.error) throw new Error(retryByEmail.error.message);
      if (retryByEmail.data?.id === input.userId) {
        return { profile: retryByEmail.data as ResolvedAuthProfile, source: "email" };
      }
      if (retryByEmail.data?.id) {
        throw new Error("Profile email is linked to another account");
      }
    }
    throw new Error(inserted.error.message);
  }

  if (!inserted.data?.id) {
    throw new Error("Profile creation failed");
  }

  return { profile: inserted.data as ResolvedAuthProfile, source: "created" };
}
