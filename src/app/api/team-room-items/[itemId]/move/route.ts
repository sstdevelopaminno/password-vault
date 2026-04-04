import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from '@/lib/team-room-access';
import { teamRoomMoveItemSchema } from '@/lib/validators';

type TeamItemRow = {
 id: string;
 room_id: string;
 title: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
 const { itemId } = await params;

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const payload = await req.json().catch(() => ({}));
 const parsed = teamRoomMoveItemSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
 }

 const admin = createAdminClient();
 const { data: item, error: itemError } = await admin
 .from('team_room_items')
 .select('id,room_id,title')
 .eq('id', itemId)
 .maybeSingle();

 if (itemError) {
 return NextResponse.json({ error: itemError.message }, { status: 400 });
 }
 if (!item?.id) {
 return NextResponse.json({ error: 'Item not found' }, { status: 404 });
 }

 const row = item as TeamItemRow;
 const sourceRoomId = String(row.room_id);
 const targetRoomId = parsed.data.targetRoomId;

 if (targetRoomId === sourceRoomId) {
 return NextResponse.json({ error: 'Item is already in this room' }, { status: 400 });
 }

 const sourceMembership = await getTeamMemberContext({ admin, roomId: sourceRoomId, userId: auth.user.id });
 if (!sourceMembership) {
 return NextResponse.json({ error: 'Item not found' }, { status: 404 });
 }

 const targetMembership = await getTeamMemberContext({ admin, roomId: targetRoomId, userId: auth.user.id });
 if (!targetMembership) {
 return NextResponse.json({ error: 'Target room not found' }, { status: 404 });
 }

 const { error: moveError } = await admin
 .from('team_room_items')
 .update({ room_id: targetRoomId, updated_at: new Date().toISOString() })
 .eq('id', itemId)
 .eq('room_id', sourceRoomId);

 if (moveError) {
 return NextResponse.json({ error: moveError.message }, { status: 400 });
 }

 await touchTeamRoomUpdatedAt({ admin, roomId: sourceRoomId });
 await touchTeamRoomUpdatedAt({ admin, roomId: targetRoomId });

 await logAudit('team_room_item_moved', {
 team_item_id: itemId,
 title: row.title,
 source_room_id: sourceRoomId,
 target_room_id: targetRoomId,
 actor_user_id: auth.user.id,
 });

 await admin.from('team_room_messages').insert({
 room_id: targetRoomId,
 sender_user_id: auth.user.id,
 message_type: 'shared_item',
 body_text: null,
 metadata_json: {
 movedFromRoomId: sourceRoomId,
 teamItemId: itemId,
 title: row.title,
 event: 'item_moved',
 },
 });

 return NextResponse.json({ ok: true, itemId, sourceRoomId, targetRoomId });
}
