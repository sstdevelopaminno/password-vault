import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptText, encryptText } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { requirePinAssertion } from "@/lib/pin-guard";
import { createAdminClient, resolveProfileForAuthUser } from "@/lib/supabase/admin";

async function resolveOwner(input: { userId: string; email?: string | null; fullName?: string | null }) {
  const resolved = await resolveProfileForAuthUser(input);
  return { ownerId: resolved.profile.id, source: resolved.source };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owner = await resolveOwner({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });
  const admin = createAdminClient();

  const { data: item, error } = await admin
    .from("vault_items")
    .select("id,title,url,category,updated_at,username_value_encrypted")
    .eq("id", id)
    .eq("owner_user_id", owner.ownerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code ?? null }, { status: 400 });
  }
  if (item == null) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: item.id,
    title: item.title,
    url: item.url,
    category: item.category,
    updated_at: item.updated_at,
    username: decryptText(item.username_value_encrypted),
    secretMasked: "**********",
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await req.json();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pinCheck = requirePinAssertion({ request: req, userId: auth.user.id, action: "edit_secret", targetItemId: id });
  if (pinCheck.ok === false) return pinCheck.response;

  const owner = await resolveOwner({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });
  const admin = createAdminClient();

  const { error } = await admin
    .from("vault_items")
    .update({
      title: payload.title,
      username_value_encrypted: payload.username ? encryptText(payload.username) : undefined,
      secret_value_encrypted: payload.secret ? encryptText(payload.secret) : undefined,
      notes_encrypted: payload.notes ? encryptText(payload.notes) : null,
      url: payload.url ?? null,
      category: payload.category ?? null,
    })
    .eq("id", id)
    .eq("owner_user_id", owner.ownerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit("vault_item_updated", { target_vault_item_id: id, profile_source: owner.source });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user == null) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pinCheck = requirePinAssertion({ request: req, userId: auth.user.id, action: "delete_secret", targetItemId: id });
  if (pinCheck.ok === false) return pinCheck.response;

  const owner = await resolveOwner({
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: String(auth.user.user_metadata?.full_name ?? ""),
  });
  const admin = createAdminClient();

  const { error } = await admin.from("vault_items").delete().eq("id", id).eq("owner_user_id", owner.ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit("vault_item_deleted", { target_vault_item_id: id, profile_source: owner.source });
  return NextResponse.json({ ok: true });
}
