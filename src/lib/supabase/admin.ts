import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required Supabase env: ${name}`);
  }
  return value;
}

export function createAdminClient() {
  if (adminClient) return adminClient;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminClient;
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

const AUTH_PROFILE_SELECT_COLUMNS =
  "id,email,full_name,role,status,pin_hash,email_verified_at";

export type AuthUserSummary = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  banned_until: string | null;
  last_sign_in_at: string | null;
};

type AuthUserLookupRpcRow = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  banned_until: string | null;
  last_sign_in_at: string | null;
};

type AuthLookupCacheItem = {
  value: AuthUserSummary | null;
  expiresAt: number;
};

const AUTH_LOOKUP_CACHE_TTL_MS = 2 * 60 * 1000;
const AUTH_LOOKUP_CACHE_MAX = 5000;
const authLookupCache = new Map<string, AuthLookupCacheItem>();

function isDuplicateEmailConstraintError(message: unknown) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("duplicate key value") && text.includes("profiles_email_key");
}

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function getCachedAuthUserByEmail(email: string) {
  const hit = authLookupCache.get(email);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    authLookupCache.delete(email);
    return undefined;
  }
  return hit.value;
}

function setCachedAuthUserByEmail(email: string, value: AuthUserSummary | null) {
  authLookupCache.set(email, {
    value,
    expiresAt: Date.now() + AUTH_LOOKUP_CACHE_TTL_MS,
  });

  if (authLookupCache.size <= AUTH_LOOKUP_CACHE_MAX) return;

  const overflow = authLookupCache.size - AUTH_LOOKUP_CACHE_MAX;
  const oldest = Array.from(authLookupCache.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .slice(0, overflow);

  for (const [key] of oldest) {
    authLookupCache.delete(key);
  }
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const cached = getCachedAuthUserByEmail(normalizedEmail);
  if (cached !== undefined) return cached;

  const admin = createAdminClient();
  try {
    const lookedUp = await admin.rpc("find_auth_user_by_email", { p_email: normalizedEmail });
    if (!lookedUp.error) {
      const row = (Array.isArray(lookedUp.data) ? lookedUp.data[0] : lookedUp.data) as AuthUserLookupRpcRow | null;
      if (row?.id) {
        const found = {
          id: String(row.id),
          email: String(row.email ?? normalizedEmail),
          email_confirmed_at: row.email_confirmed_at ? String(row.email_confirmed_at) : null,
          banned_until: row.banned_until ? String(row.banned_until) : null,
          last_sign_in_at: row.last_sign_in_at ? String(row.last_sign_in_at) : null,
        };
        setCachedAuthUserByEmail(normalizedEmail, found);
        return found;
      }
      setCachedAuthUserByEmail(normalizedEmail, null);
      return null;
    }
  } catch {
    // Fallback to listUsers scan only when RPC is unavailable.
  }

  const perPage = 1000;
  const maxPages = Number(process.env.AUTH_LIST_USERS_MAX_PAGES ?? 50);
  const safeMaxPages = Number.isFinite(maxPages) && maxPages > 0 ? Math.min(200, Math.floor(maxPages)) : 50;

  for (let page = 1; page <= safeMaxPages; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) throw new Error(listed.error.message);

    const users = listed.data?.users ?? [];
    const matched = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail);
    if (matched) {
      const found = {
        id: String(matched.id),
        email: String(matched.email ?? ""),
        email_confirmed_at: matched.email_confirmed_at ? String(matched.email_confirmed_at) : null,
        banned_until: matched.banned_until ? String(matched.banned_until) : null,
        last_sign_in_at: matched.last_sign_in_at ? String(matched.last_sign_in_at) : null,
      };
      setCachedAuthUserByEmail(normalizedEmail, found);
      return found;
    }

    if (users.length < perPage) {
      break;
    }
  }

  setCachedAuthUserByEmail(normalizedEmail, null);
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
    .select(AUTH_PROFILE_SELECT_COLUMNS)
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
          .select(AUTH_PROFILE_SELECT_COLUMNS)
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
      .select(AUTH_PROFILE_SELECT_COLUMNS)
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
    .select(AUTH_PROFILE_SELECT_COLUMNS)
    .maybeSingle();

  if (inserted.error) {
    if (isDuplicateEmailConstraintError(inserted.error.message)) {
      const retryById = await admin
        .from("profiles")
        .select(AUTH_PROFILE_SELECT_COLUMNS)
        .eq("id", input.userId)
        .maybeSingle();
      if (retryById.error) throw new Error(retryById.error.message);
      if (retryById.data?.id) {
        return { profile: retryById.data as ResolvedAuthProfile, source: "id" };
      }

      const retryByEmail = await admin
        .from("profiles")
        .select(AUTH_PROFILE_SELECT_COLUMNS)
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

  const pendingApproval = await admin
    .from("approval_requests")
    .insert({
      user_id: input.userId,
      request_status: "pending",
    });
  if (pendingApproval.error) {
    throw new Error(pendingApproval.error.message);
  }

  return { profile: inserted.data as ResolvedAuthProfile, source: "created" };
}
