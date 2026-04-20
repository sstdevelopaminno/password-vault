import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { touchTeamRoomUpdatedAt } from "@/lib/team-room-access";
import { resolveAccessibleUserIds } from "@/lib/user-identity";

type TeamItemShareRow = {
  id: string;
  room_id: string;
};

function parseItemId(params: unknown) {
  if (params && typeof params === "object" && "id" in params) {
    const value = (params as { id?: unknown }).id;
    if (typeof value === "string") return value;
  }
  return "";
}

export async function DELETE(_: NextRequest, context: { params: Promise<unknown> }) {
  const id = parseItemId(await context.params);
  if (!id) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ownerId = auth.user.id;
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const { data: item, error: itemError } = await admin
    .from("vault_items")
    .select("id")
    .eq("id", id)
    .in("owner_user_id", ownerIds)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }
  if (!item?.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const { data: shareRows, error: shareError } = await admin
    .from("team_room_items")
    .select("id,room_id")
    .eq("source_vault_item_id", id)
    .in("created_by", ownerIds);

  if (shareError) {
    return NextResponse.json({ error: shareError.message }, { status: 400 });
  }

  const shares = (shareRows as TeamItemShareRow[] | null) ?? [];
  if (shares.length === 0) {
    return NextResponse.json({ ok: true, removedCount: 0 });
  }

  const shareIds = shares.map((row) => row.id);
  const roomIds = Array.from(new Set(shares.map((row) => row.room_id)));

  const { error: deleteError } = await admin
    .from("team_room_items")
    .delete()
    .in("id", shareIds)
    .in("created_by", ownerIds);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  for (const roomId of roomIds) {
    await touchTeamRoomUpdatedAt({ admin, roomId });
  }

  await logAudit("team_room_item_unshared_from_personal", {
    source_vault_item_id: id,
    removed_count: shareIds.length,
    actor_user_id: ownerId,
  });

  return NextResponse.json({ ok: true, removedCount: shareIds.length });
}
