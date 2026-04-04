import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptText, encryptText } from '@/lib/crypto';
import { vaultSchema } from '@/lib/validators';
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from '@/lib/team-room-access';
import { logAudit } from '@/lib/audit';

type TeamItemRow = {
 id: string;
 title: string;
 username_value_encrypted: string;
 url: string | null;
 category: string | null;
 updated_at: string;
};

function parseLimit(raw: string | null, fallback = 12, max = 20) {
 const value = Number(raw ?? fallback);
 if (!Number.isFinite(value)) return fallback;
 return Math.min(max, Math.max(1, Math.floor(value)));
}

function parsePage(raw: string | null, fallback = 1) {
 const value = Number(raw ?? fallback);
 if (!Number.isFinite(value)) return fallback;
 return Math.max(1, Math.floor(value));
}

export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const admin = createAdminClient();
 const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id });
 if (!member) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }

 const { searchParams } = new URL(req.url);
 const limit = parseLimit(searchParams.get('limit'));
 const page = parsePage(searchParams.get('page'));
 const from = (page - 1) * limit;
 const to = from + limit - 1;

 const { data: items, error, count } = await admin
 .from('team_room_items')
 .select('id,title,username_value_encrypted,url,category,updated_at', { count: 'exact' })
 .eq('room_id', roomId)
 .order('updated_at', { ascending: false })
 .order('id', { ascending: false })
 .range(from, to);

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const mapped = (items as TeamItemRow[] | null ?? []).map((item) => ({
 id: item.id,
 title: item.title,
 username: decryptText(item.username_value_encrypted),
 url: item.url,
 category: item.category,
 updated_at: item.updated_at,
 }));

 const total = Number(count ?? 0);
 const totalPages = Math.max(1, Math.ceil(total / limit));

 return NextResponse.json({
 items: mapped,
 memberRole: member.role,
 pagination: {
 page,
 limit,
 total,
 totalPages,
 hasPrev: page > 1,
 hasNext: page < totalPages,
 },
 });
}

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;
 const payload = await req.json().catch(() => ({}));
 const parsed = vaultSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const admin = createAdminClient();
 const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id });
 if (!member) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }

 const body = parsed.data;
 const { data: inserted, error } = await admin
 .from('team_room_items')
 .insert({
 room_id: roomId,
 created_by: auth.user.id,
 source_vault_item_id: null,
 title: body.title,
 username_value_encrypted: encryptText(body.username),
 secret_value_encrypted: encryptText(body.secret),
 notes_encrypted: body.notes ? encryptText(body.notes) : null,
 url: body.url || null,
 category: body.category || null,
 updated_at: new Date().toISOString(),
 })
 .select('id,title,url,category,updated_at')
 .single();

 if (error || !inserted) {
 return NextResponse.json({ error: error?.message ?? 'Create item failed' }, { status: 400 });
 }

 await touchTeamRoomUpdatedAt({ admin, roomId });
 await logAudit('team_room_item_created', {
 room_id: roomId,
 team_item_id: inserted.id,
 title: inserted.title,
 });

 return NextResponse.json({
 item: {
 id: inserted.id,
 title: inserted.title,
 username: body.username,
 url: inserted.url,
 category: inserted.category,
 updatedAt: inserted.updated_at,
 },
 });
}
