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
}): Promise<TeamMemberContext | null> { 
  const { data, error } = await input.admin 
    .from("team_room_members") 
    .select("room_id,member_role") 
    .eq("room_id", input.roomId) 
    .eq("user_id", input.userId) 
    .maybeSingle(); 
 
  if (error) { 
    throw new Error(error.message); 
  } 
  if (!data?.room_id) { 
    return null; 
  } 
 
  return { 
    roomId: String(data.room_id), 
    role: String(data.member_role ?? "member") as TeamMemberRole, 
  }; 
} 
 
export async function touchTeamRoomUpdatedAt(input: { 
  admin: SupabaseClient; 
  roomId: string; 
}) { 
  await input.admin.from("team_rooms").update({ updated_at: new Date().toISOString() }).eq("id", input.roomId); 
}
