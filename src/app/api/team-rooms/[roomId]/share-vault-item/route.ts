import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptText } from "@/lib/crypto";
import { teamRoomShareSchema } from "@/lib/validators";
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from "@/lib/team-room-access";
import { logAudit } from "@/lib/audit";

type VaultSourceItem = {
  id: string;
  title: string;
  username_value_encrypted: string;
  secret_value_encrypted: string;
  url: string | null;
  category: string | null;
  notes_encrypted: string | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const payload = await req.json().catch(() => ({}));
  const parsed = teamRoomShareSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id });
  if (!member) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { data: source, error: sourceError } = await admin
    .from("vault_items")
    .select("id,title,username_value_encrypted,secret_value_encrypted,url,category,notes_encrypted")
    .eq("id", parsed.data.vaultItemId)
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();

  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 400 });
  }
  if (!source?.id) {
    return NextResponse.json({ error: "Source item not found" }, { status: 404 });
  }

  const sourceItem = source as VaultSourceItem;
  const { data: inserted, error: insertError } = await admin
    .from("team_room_items")
    .insert({
      room_id: roomId,
      created_by: auth.user.id,
      title: sourceItem.title,
      username_value_encrypted: sourceItem.username_value_encrypted,
      secret_value_encrypted: sourceItem.secret_value_encrypted,
      url: sourceItem.url,
      category: sourceItem.category,
      notes_encrypted: sourceItem.notes_encrypted,
      updated_at: new Date().toISOString(),
    })
    .select("id,title,url,category,updated_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Share failed" }, { status: 400 });
  }

  const noteText = parsed.data.note ? parsed.data.note : null;
  const { error: messageError } = await admin.from("team_room_messages").insert({
    room_id: roomId,
    sender_user_id: auth.user.id,
    message_type: "shared_item",
    body_text: noteText,
    metadata_json: {
      sourceVaultItemId: sourceItem.id,
      teamItemId: inserted.id,
      title: sourceItem.title,
      usernamePreview: decryptText(sourceItem.username_value_encrypted),
      url: sourceItem.url ?? null,
      category: sourceItem.category ?? null,
    },
  });
  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 400 });
  }

  await touchTeamRoomUpdatedAt({ admin, roomId });
  await logAudit("team_room_item_shared_from_personal", {
    room_id: roomId,
    source_vault_item_id: sourceItem.id,
    target_team_item_id: inserted.id,
  });

  return NextResponse.json({
    ok: true,
    item: {
      id: inserted.id,
      title: inserted.title,
      username: decryptText(sourceItem.username_value_encrypted),
      url: inserted.url,
      category: inserted.category,
      updatedAt: inserted.updated_at,
    },
  });
}
