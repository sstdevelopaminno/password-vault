import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamRoomCreateSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";

type TeamRoomRecord = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function GET() {
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
  const { data: membershipRows, error: membershipError } = await admin
    .from("team_room_members")
    .select("room_id,member_role")
    .in("user_id", memberUserIds);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const roomIds = (membershipRows ?? [])
    .map((row) => String(row.room_id ?? ""))
    .filter(Boolean);

  if (roomIds.length === 0) {
    return NextResponse.json({ rooms: [] });
  }

  const { data: rooms, error: roomsError } = await admin
    .from("team_rooms")
    .select("id,name,description,created_by,created_at,updated_at")
    .in("id", roomIds)
    .order("updated_at", { ascending: false });

  if (roomsError) {
    return NextResponse.json({ error: roomsError.message }, { status: 400 });
  }

  const roleMap = new Map<string, string>();
  for (const row of membershipRows ?? []) {
    const roomId = String(row.room_id ?? "");
    if (!roomId) continue;
    const role = String(row.member_role ?? "member");
    if (role === "owner" || !roleMap.has(roomId)) {
      roleMap.set(roomId, role);
    }
  }

  const shaped = (rooms as TeamRoomRecord[] | null ?? []).map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description ?? "",
    createdBy: room.created_by,
    createdAt: room.created_at,
    updatedAt: room.updated_at,
    memberRole: roleMap.get(room.id) ?? "member",
  }));

  return NextResponse.json({ rooms: shaped });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const parsed = teamRoomCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const actorUserIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const actorUserId = pickPrimaryUserId({
    authUserId: auth.user.id,
    accessibleUserIds: actorUserIds,
  });
  const { data: insertedRoom, error: roomError } = await admin
    .from("team_rooms")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ? parsed.data.description : null,
      created_by: actorUserId,
      updated_at: new Date().toISOString(),
    })
    .select("id,name,description,created_by,created_at,updated_at")
    .single();

  if (roomError || !insertedRoom) {
    return NextResponse.json({ error: roomError?.message ?? "Create room failed" }, { status: 400 });
  }

  const { error: memberError } = await admin.from("team_room_members").insert({
    room_id: insertedRoom.id,
    user_id: actorUserId,
    member_role: "owner",
  });
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  await logAudit("team_room_created", {
    room_id: insertedRoom.id,
    room_name: insertedRoom.name,
  });

  return NextResponse.json({
    room: {
      id: insertedRoom.id,
      name: insertedRoom.name,
      description: insertedRoom.description ?? "",
      createdBy: insertedRoom.created_by,
      createdAt: insertedRoom.created_at,
      updatedAt: insertedRoom.updated_at,
      memberRole: "owner",
    },
  });
}
