import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptText, encryptText } from "@/lib/crypto";
import { vaultSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { recordApiMetric } from "@/lib/api-metrics";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";

const ROUTE_PATH = "/api/vault";

function parseLimit(raw: string | null, fallback = 50, max = 100) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function decodeCursor(raw: string | null): { updated_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.updated_at !== "string" || typeof parsed?.id !== "string") return null;
    return { updated_at: parsed.updated_at, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(value: { updated_at: string; id: string }) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    recordApiMetric(ROUTE_PATH, "GET", 401, Date.now() - startedAt);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveProfileForAuthUser({
    userId: data.user.id,
    email: data.user.email ?? "",
    fullName: String(data.user.user_metadata?.full_name ?? ""),
  });
  const ownerId = resolved.profile.id;
  const admin = createAdminClient();

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  let query = admin
    .from("vault_items")
    .select("id,title,url,category,updated_at,username_value_encrypted")
    .eq("owner_user_id", ownerId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or("updated_at.lt." + cursor.updated_at + ",and(updated_at.eq." + cursor.updated_at + ",id.lt." + cursor.id + ")");
  }

  const { data: items, error } = await query;

  if (error) {
    recordApiMetric(ROUTE_PATH, "GET", 400, Date.now() - startedAt);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const hasMore = (items ?? []).length > limit;
  const currentPage = (items ?? []).slice(0, limit);
  const last = currentPage[currentPage.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({
        updated_at: new Date(last.updated_at).toISOString(),
        id: String(last.id),
      })
    : null;

  const safeItems = currentPage.map((item) => ({
    ...item,
    username: decryptText(item.username_value_encrypted),
    username_value_encrypted: undefined,
  }));

  recordApiMetric(ROUTE_PATH, "GET", 200, Date.now() - startedAt);
  return NextResponse.json({
    items: safeItems,
    pagination: {
      limit,
      hasMore,
      nextCursor,
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

  const resolved = await resolveProfileForAuthUser({
    userId: data.user.id,
    email: data.user.email ?? "",
    fullName: String(data.user.user_metadata?.full_name ?? ""),
  });
  const ownerId = resolved.profile.id;
  const admin = createAdminClient();

  const body = parsed.data;
  const { data: inserted, error } = await admin
    .from("vault_items")
    .insert({
      owner_user_id: ownerId,
      title: body.title,
      username_value_encrypted: encryptText(body.username),
      secret_value_encrypted: encryptText(body.secret),
      notes_encrypted: body.notes ? encryptText(body.notes) : null,
      url: body.url || null,
      category: body.category || null,
    })
    .select("id,title,category,updated_at")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Failed to create item" }, { status: 400 });
  }

  await logAudit("vault_item_created", { owner_user_id: ownerId, title: body.title, profile_source: resolved.source });

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
