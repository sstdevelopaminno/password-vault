import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamRoomMessageSchema } from "@/lib/validators";
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from "@/lib/team-room-access";
import { logAudit } from "@/lib/audit";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";

type MessageRow = {
  id: string;
  room_id: string;
  sender_user_id: string;
  message_type: "text" | "shared_item";
  body_text: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function parseLimit(raw: string | null, fallback = 40, max = 120) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
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
  const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
  if (!member) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));

  const { data: rows, error } = await admin
    .from("team_room_messages")
    .select("id,room_id,sender_user_id,message_type,body_text,metadata_json,created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .range(0, limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const messages = (rows as MessageRow[] | null ?? []).slice().reverse();
  const senderIds = Array.from(new Set(messages.map((row) => row.sender_user_id).filter(Boolean)));

  const profilesById = new Map<string, { fullName: string; email: string }>();
  if (senderIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", senderIds);
    for (const row of (profileRows as ProfileRow[] | null ?? [])) {
      profilesById.set(String(row.id), {
        fullName: String(row.full_name ?? ""),
        email: String(row.email ?? ""),
      });
    }
  }

  return NextResponse.json({
    messages: messages.map((row) => {
      const sender = profilesById.get(row.sender_user_id);
      return {
        id: row.id,
        roomId: row.room_id,
        senderUserId: row.sender_user_id,
        senderName: sender?.fullName || sender?.email || "Member",
        messageType: row.message_type,
        body: row.body_text ?? "",
        metadata: row.metadata_json ?? {},
        createdAt: row.created_at,
      };
    }),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const payload = await req.json().catch(() => ({}));
  const parsed = teamRoomMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

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
  const actorUserId = pickPrimaryUserId({
    authUserId: auth.user.id,
    accessibleUserIds: memberUserIds,
  });
  const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
  if (!member) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error } = await admin
    .from("team_room_messages")
    .insert({
      room_id: roomId,
      sender_user_id: actorUserId,
      message_type: "text",
      body_text: parsed.data.body,
      metadata_json: {},
      created_at: nowIso,
    })
    .select("id,room_id,sender_user_id,message_type,body_text,metadata_json,created_at")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Create message failed" }, { status: 400 });
  }

  await touchTeamRoomUpdatedAt({ admin, roomId });
  await logAudit("team_room_message_created", {
    room_id: roomId,
    message_id: inserted.id,
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name,email")
    .eq("id", actorUserId)
    .maybeSingle();

  return NextResponse.json({
    message: {
      id: inserted.id,
      roomId: inserted.room_id,
      senderUserId: inserted.sender_user_id,
      senderName: String(profile?.full_name ?? profile?.email ?? "Member"),
      messageType: inserted.message_type,
      body: inserted.body_text ?? "",
      metadata: inserted.metadata_json ?? {},
      createdAt: inserted.created_at,
    },
  });
}
