import type { SupabaseClient } from "@supabase/supabase-js"; 
 
type TeamMemberRole = "owner" | "member"; 
 
export type TeamMemberContext = { 
  roomId: string; 
  role: TeamMemberRole; 
}; 
 
export async function getTeamMemberContext(input: { 
  admin: SupabaseClient; 
  roomId: string; 
  userId: string;
  userIds?: string[];
}): Promise<TeamMemberContext | null> { 
  const lookupIds = Array.from(
    new Set(
      (input.userIds && input.userIds.length > 0 ? input.userIds : [input.userId])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (lookupIds.length === 0) {
    return null;
  }

  let query = input.admin
    .from("team_room_members")
    .select("room_id,member_role,user_id")
    .eq("room_id", input.roomId);

  query = lookupIds.length === 1 ? query.eq("user_id", lookupIds[0]) : query.in("user_id", lookupIds);
  const { data, error } = await query;
 
  if (error) { 
    throw new Error(error.message); 
  } 
  const rows = (data as Array<{ room_id?: string | null; member_role?: string | null }> | null) ?? [];
  if (rows.length === 0) {
    return null; 
  } 
 
  const role = rows.some((row) => String(row.member_role ?? "member") === "owner") ? "owner" : "member";
  return { 
    roomId: String(rows[0]?.room_id ?? input.roomId),
    role: role,
  }; 
} 
 
export async function touchTeamRoomUpdatedAt(input: { 
  admin: SupabaseClient; 
  roomId: string; 
}) { 
  await input.admin.from("team_rooms").update({ updated_at: new Date().toISOString() }).eq("id", input.roomId); 
}
