import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from '@/lib/team-room-access';
import { teamRoomUpdateSchema } from '@/lib/validators';
import { resolveAccessibleUserIds } from '@/lib/user-identity';

type TeamRoomItemRow = {
 id: string;
 room_id: string;
 created_by: string;
 source_vault_item_id: string | null;
 title: string;
 username_value_encrypted: string;
 secret_value_encrypted: string;
 url: string | null;
 category: string | null;
 notes_encrypted: string | null;
 created_at: string;
 updated_at: string;
};

type RestoreResult = {
 totalCount: number;
 restoredCount: number;
 syncedCount: number;
};

function forbidden(message: string) {
 return NextResponse.json({ error: message }, { status: 403 });
}

async function restoreItemsToPersonalVault(input: { admin: SupabaseClient; roomId: string }): Promise<RestoreResult> {
 const { data: items, error } = await input.admin
 .from('team_room_items')
 .select('id,room_id,created_by,source_vault_item_id,title,username_value_encrypted,secret_value_encrypted,url,category,notes_encrypted,created_at,updated_at')
 .eq('room_id', input.roomId);

 if (error) {
 throw new Error(error.message);
 }

 const rows = (items as TeamRoomItemRow[] | null ?? []);
 if (rows.length === 0) {
 return { totalCount: 0, restoredCount: 0, syncedCount: 0 };
 }

 let restoredCount = 0;
 let syncedCount = 0;

 for (const item of rows) {
 const updatePayload = {
 title: item.title,
 username_value_encrypted: item.username_value_encrypted,
 secret_value_encrypted: item.secret_value_encrypted,
 url: item.url,
 category: item.category,
 notes_encrypted: item.notes_encrypted,
 updated_at: new Date().toISOString(),
 };

 let targetVaultItemId = '';


 if (item.source_vault_item_id) {
 const { data: existingSource, error: sourceError } = await input.admin
 .from('vault_items')
 .select('id')
 .eq('id', item.source_vault_item_id)
 .eq('owner_user_id', item.created_by)
 .maybeSingle();

 if (sourceError) {
 throw new Error(sourceError.message);
 }

 if (existingSource?.id) {
 const { error: updateError } = await input.admin
 .from('vault_items')
 .update(updatePayload)
 .eq('id', existingSource.id)
 .eq('owner_user_id', item.created_by);

 if (updateError) {
 throw new Error(updateError.message);
 }

 targetVaultItemId = String(existingSource.id);
 syncedCount += 1;
 }
 }

 if (!targetVaultItemId) {
 const { data: inserted, error: insertError } = await input.admin
 .from('vault_items')
 .insert({
 owner_user_id: item.created_by,
 title: item.title,
 username_value_encrypted: item.username_value_encrypted,
 secret_value_encrypted: item.secret_value_encrypted,
 url: item.url,
 category: item.category,
 notes_encrypted: item.notes_encrypted,
 created_at: item.created_at,
 updated_at: new Date().toISOString(),
 })
 .select('id')
 .single();

 if (insertError || !inserted?.id) {
 throw new Error(insertError?.message ?? 'Failed to restore team item to personal vault');
 }

 targetVaultItemId = String(inserted.id);
 restoredCount += 1;
 }

 await logAudit('team_room_item_restored_to_personal', {
 room_id: item.room_id,
 team_item_id: item.id,
 target_user_id: item.created_by,
 source_vault_item_id: item.source_vault_item_id,
 target_vault_item_id: targetVaultItemId,
 });
 }

 return { totalCount: rows.length, restoredCount, syncedCount };
}

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const admin = createAdminClient();
 const memberUserIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
 if (!member) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }

 const { data: room, error } = await admin
 .from('team_rooms')
 .select('id,name,description,created_by,created_at,updated_at')
 .eq('id', roomId)
 .maybeSingle();

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }
 if (!room?.id) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }

 return NextResponse.json({
 room: {
 id: String(room.id),
 name: String(room.name ?? ''),
 description: String(room.description ?? ''),
 createdBy: String(room.created_by ?? ''),
 createdAt: String(room.created_at ?? ''),
 updatedAt: String(room.updated_at ?? ''),
 memberRole: member.role,
 },
 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const payload = await req.json().catch(() => ({}));
 const parsed = teamRoomUpdateSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
 }

 const admin = createAdminClient();
 const memberUserIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
 if (!member) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }
 if (member.role !== 'owner') {
 return forbidden('Only room owner can update this room');
 }

 const { data: updatedRoom, error } = await admin
 .from('team_rooms')
 .update({
 name: parsed.data.name,
 description: parsed.data.description ? parsed.data.description : null,
 updated_at: new Date().toISOString(),
 })
 .eq('id', roomId)
 .select('id,name,description,created_by,created_at,updated_at')
 .maybeSingle();

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }
 if (!updatedRoom?.id) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }

 await touchTeamRoomUpdatedAt({ admin, roomId });
 await logAudit('team_room_updated', {
 room_id: roomId,
 room_name: updatedRoom.name,
 });

 return NextResponse.json({
 room: {
 id: String(updatedRoom.id),
 name: String(updatedRoom.name ?? ''),
 description: String(updatedRoom.description ?? ''),
 createdBy: String(updatedRoom.created_by ?? ''),
 createdAt: String(updatedRoom.created_at ?? ''),
 updatedAt: String(updatedRoom.updated_at ?? ''),
 memberRole: 'owner',
 },
 });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const admin = createAdminClient();
 const memberUserIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
 if (!member) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }
 if (member.role !== 'owner') {
 return forbidden('Only room owner can delete this room');
 }

 let restoreResult: RestoreResult;
 try {
 restoreResult = await restoreItemsToPersonalVault({ admin, roomId });
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Failed to restore room items';
 return NextResponse.json({ error: message }, { status: 400 });
 }

 const { error } = await admin.from('team_rooms').delete().eq('id', roomId);
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 await logAudit('team_room_deleted', {
 room_id: roomId,
 restored_item_count: restoreResult.restoredCount,
 synced_item_count: restoreResult.syncedCount,
 total_item_count: restoreResult.totalCount,
 });

 return NextResponse.json({ ok: true, restoreResult });
}
