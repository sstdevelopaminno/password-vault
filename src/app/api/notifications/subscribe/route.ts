import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

async function getAuthUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

function parsePayload(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const payload = value as PushSubscriptionPayload;
  const endpoint = String(payload.endpoint ?? "");
  const p256dh = String(payload.keys?.p256dh ?? "");
  const auth = String(payload.keys?.auth ?? "");

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return { endpoint, p256dh, auth };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,is_active,last_seen_at,created_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    items: data ?? [],
    total: (data ?? []).length,
  });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = parsePayload(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid push subscription payload" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: parsed.endpoint,
        p256dh_key: parsed.p256dh,
        auth_key: parsed.auth,
        user_agent: req.headers.get("user-agent") ?? "",
        is_active: true,
        last_seen_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "endpoint" },
    )
    .select("id,endpoint,is_active,last_seen_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subscription: data,
  });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = String((body as { endpoint?: string }).endpoint ?? "").trim();
  const admin = createAdminClient();

  const query = admin.from("push_subscriptions").delete().eq("user_id", user.id);
  const result = endpoint ? await query.eq("endpoint", endpoint) : await query;

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
