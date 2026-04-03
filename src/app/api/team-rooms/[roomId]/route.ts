import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamMemberContext } from "@/lib/team-room-access";

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const member = await getTeamMemberContext({
    admin,
    roomId,
    userId: auth.user.id,
  });
  if (!member) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { data: room, error } = await admin
    .from("team_rooms")
    .select("id,name,description,created_by,created_at,updated_at")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!room?.id) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({
    room: {
      id: String(room.id),
      name: String(room.name ?? ""),
      description: String(room.description ?? ""),
      createdBy: String(room.created_by ?? ""),
      createdAt: String(room.created_at ?? ""),
      updatedAt: String(room.updated_at ?? ""),
      memberRole: member.role,
    },
  });
}
