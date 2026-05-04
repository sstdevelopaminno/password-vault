import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptText, encryptText } from "@/lib/crypto";
import { vaultSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { recordApiMetric } from "@/lib/api-metrics";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { assertVaultItemQuota, collectPackageUsageSnapshot } from "@/lib/package-entitlements";

const ROUTE_PATH = "/api/vault";

type TeamShareCountRow = {
  source_vault_item_id: string | null;
};

function parseLimit(raw: string | null, fallback = 12, max = 20) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function parsePage(raw: string | null, fallback = 1) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function normalizeSearchQuery(raw: string | null) {
  return String(raw ?? "").trim();
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    recordApiMetric(ROUTE_PATH, "GET", 401, Date.now() - startedAt);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: data.user.id,
    authEmail: data.user.email,
  });

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const page = parsePage(searchParams.get("page"));
  const q = normalizeSearchQuery(searchParams.get("q"));
  const includeStorage = searchParams.get("includeStorage") === "1";
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin
    .from("vault_items")
    .select("id,title,url,category,updated_at,username_value_encrypted", { count: "exact" })
    .in("owner_user_id", ownerIds)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (q) {
    query = query.ilike("title", `%${q}%`);
  }

  const { data: items, error, count } = await query;

  if (error) {
    recordApiMetric(ROUTE_PATH, "GET", 400, Date.now() - startedAt);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const itemIds = (items ?? []).map((item) => String(item.id));
  const sharedCountBySource = new Map<string, number>();

  if (itemIds.length > 0) {
    const { data: shareRows } = await admin
      .from("team_room_items")
      .select("source_vault_item_id")
      .in("created_by", ownerIds)
      .in("source_vault_item_id", itemIds);

    for (const row of (shareRows as TeamShareCountRow[] | null) ?? []) {
      const sourceId = String(row.source_vault_item_id ?? "").trim();
      if (!sourceId) continue;
      sharedCountBySource.set(sourceId, (sharedCountBySource.get(sourceId) ?? 0) + 1);
    }
  }

  const total = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page < totalPages;

  const safeItems = (items ?? []).map(function (item) {
  let username = "";
  let cryptoState = "ok";
  try {
    username = decryptText(item.username_value_encrypted);
  } catch (error) {
    cryptoState = "needs_reencrypt";
    console.error("Vault item username decrypt failed:", item.id, error);
  }
  return {
    ...item,
    username: username,
    username_value_encrypted: undefined,
    shared_to_team_count: sharedCountBySource.get(String(item.id)) ?? 0,
    crypto_state: cryptoState,
  };
});

let storageUsedBytes = 0;
  if (includeStorage) {
    const storageQuery = await admin
      .from("vault_items")
      .select("title,url,category,username_value_encrypted,secret_value_encrypted,notes_encrypted")
      .in("owner_user_id", ownerIds);

    if (!storageQuery.error) {
      storageUsedBytes = (storageQuery.data ?? []).reduce(function (sum, row) {
        return (
          sum +
          Buffer.byteLength(String(row.title ?? ""), "utf8") +
          Buffer.byteLength(String(row.url ?? ""), "utf8") +
          Buffer.byteLength(String(row.category ?? ""), "utf8") +
          Buffer.byteLength(String(row.username_value_encrypted ?? ""), "utf8") +
          Buffer.byteLength(String(row.secret_value_encrypted ?? ""), "utf8") +
          Buffer.byteLength(String(row.notes_encrypted ?? ""), "utf8")
        );
      }, 0);
    }
  }

  recordApiMetric(ROUTE_PATH, "GET", 200, Date.now() - startedAt);
  return NextResponse.json({
    items: safeItems,
    storage: {
      usedBytes: storageUsedBytes,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: hasMore,
      hasMore,
      nextCursor: null,
    },
  });
}

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = vaultSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = parsed.data;
  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: data.user.id,
    authEmail: data.user.email,
  });
  let ownerId = pickPrimaryUserId({
    authUserId: data.user.id,
    accessibleUserIds: ownerIds,
  });
  if (!ownerId) {
    return NextResponse.json({ error: "Unable to resolve user" }, { status: 400 });
  }

  try {
    await assertVaultItemQuota({
      admin,
      userId: ownerId,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 409 });
  }

  async function createItem(targetOwnerId: string) {
    return admin
      .from("vault_items")
      .insert({
        owner_user_id: targetOwnerId,
        title: body.title,
        username_value_encrypted: encryptText(body.username),
        secret_value_encrypted: encryptText(body.secret),
        notes_encrypted: body.notes ? encryptText(body.notes) : null,
        url: body.url || null,
        category: body.category || null,
      })
      .select("id,title,category,updated_at")
      .single();
  }

  let { data: inserted, error } = await createItem(ownerId);

  if (error?.code === "23503") {
    const resolved = await resolveProfileForAuthUser({
      userId: data.user.id,
      email: data.user.email ?? "",
      fullName: String(data.user.user_metadata?.full_name ?? ""),
    });
    ownerId = resolved.profile.id;
    try {
      await assertVaultItemQuota({
        admin,
        userId: ownerId,
      });
    } catch (quotaError) {
      return NextResponse.json(
        { error: String(quotaError instanceof Error ? quotaError.message : quotaError) },
        { status: 409 },
      );
    }
    const retried = await createItem(ownerId);
    inserted = retried.data;
    error = retried.error;
  }

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Failed to create item" }, { status: 400 });
  }

  await logAudit("vault_item_created", { owner_user_id: ownerId, title: body.title });
  try {
    await collectPackageUsageSnapshot({
      admin,
      userId: ownerId,
      includeWorkspaceBytes: false,
    });
  } catch (usageError) {
    console.error("Package usage sync failed after vault create:", usageError);
  }

  return NextResponse.json({
    ok: true,
    item: {
      id: inserted.id,
      title: inserted.title,
      username: body.username,
      category: inserted.category ?? body.category ?? null,
      updatedAt: inserted.updated_at,
    },
  });
}
