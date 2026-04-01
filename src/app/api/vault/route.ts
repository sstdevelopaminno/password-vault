import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptText, encryptText } from "@/lib/crypto";
import { vaultSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { recordApiMetric } from "@/lib/api-metrics";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";

const ROUTE_PATH = "/api/vault";

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

  const ownerId = data.user.id;
  const admin = createAdminClient();

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const page = parsePage(searchParams.get("page"));
  const q = normalizeSearchQuery(searchParams.get("q"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin
    .from("vault_items")
    .select("id,title,url,category,updated_at,username_value_encrypted", { count: "exact" })
    .eq("owner_user_id", ownerId)
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

  const total = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page < totalPages;

  const safeItems = (items ?? []).map((item) => ({
    ...item,
    username: decryptText(item.username_value_encrypted),
    username_value_encrypted: undefined,
  }));

  recordApiMetric(ROUTE_PATH, "GET", 200, Date.now() - startedAt);
  return NextResponse.json({
    items: safeItems,
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
  let ownerId = data.user.id;

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
    const retried = await createItem(ownerId);
    inserted = retried.data;
    error = retried.error;
  }

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Failed to create item" }, { status: 400 });
  }

  await logAudit("vault_item_created", { owner_user_id: ownerId, title: body.title });

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
