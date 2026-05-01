import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptText, encryptText } from "@/lib/crypto";
import { requirePinAssertion } from "@/lib/pin-guard";
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from "@/lib/team-room-access";
import { logAudit } from "@/lib/audit";
import { resolveAccessibleUserIds } from "@/lib/user-identity";

type TeamItemFullRow = {
  id: string;
  room_id: string;
  title: string;
  username_value_encrypted: string;
  url: string | null;
  category: string | null;
  updated_at: string;
};

export async function GET(_: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const memberUserIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const { data: item, error } = await admin
    .from("team_room_items")
    .select("id,room_id,title,username_value_encrypted,url,category,updated_at")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!item?.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const member = await getTeamMemberContext({
    admin,
    roomId: String(item.room_id),
    userId: auth.user.id,
    userIds: memberUserIds,
  });
  if (!member) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const row = item as TeamItemFullRow;
  return NextResponse.json({
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    url: row.url,
    category: row.category,
    updated_at: row.updated_at,
    username: decryptText(row.username_value_encrypted),
    secretMasked: "**********",
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const payload = await req.json().catch(() => ({}));
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pinCheck = await requirePinAssertion({
    request: req,
    userId: auth.user.id,
    action: "edit_secret",
    targetItemId: itemId,
  });
  if (pinCheck.ok === false) return pinCheck.response;

  const admin = createAdminClient();
  const memberUserIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const { data: existing, error: existingError } = await admin
    .from("team_room_items")
    .select("id,room_id")
    .eq("id", itemId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (!existing?.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const member = await getTeamMemberContext({
    admin,
    roomId: String(existing.room_id),
    userId: auth.user.id,
    userIds: memberUserIds,
  });
  if (!member) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("team_room_items")
    .update({
      title: payload.title,
      username_value_encrypted: payload.username ? encryptText(String(payload.username)) : undefined,
      secret_value_encrypted: payload.secret ? encryptText(String(payload.secret)) : undefined,
      notes_encrypted: payload.notes ? encryptText(String(payload.notes)) : null,
      url: payload.url ?? null,
      category: payload.category ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await touchTeamRoomUpdatedAt({ admin, roomId: String(existing.room_id) });
  await logAudit("team_room_item_updated", {
    team_item_id: itemId,
    room_id: existing.room_id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pinCheck = await requirePinAssertion({
    request: req,
    userId: auth.user.id,
    action: "delete_secret",
    targetItemId: itemId,
  });
  if (pinCheck.ok === false) return pinCheck.response;

  const admin = createAdminClient();
  const memberUserIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const { data: existing, error: existingError } = await admin
    .from("team_room_items")
    .select("id,room_id")
    .eq("id", itemId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (!existing?.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const member = await getTeamMemberContext({
    admin,
    roomId: String(existing.room_id),
    userId: auth.user.id,
    userIds: memberUserIds,
  });
  if (!member) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const { error } = await admin.from("team_room_items").delete().eq("id", itemId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await touchTeamRoomUpdatedAt({ admin, roomId: String(existing.room_id) });
  await logAudit("team_room_item_deleted", {
    team_item_id: itemId,
    room_id: existing.room_id,
  });

  return NextResponse.json({ ok: true });
}
