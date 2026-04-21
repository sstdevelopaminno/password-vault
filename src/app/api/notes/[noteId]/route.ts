import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { noteUpdateSchema } from '@/lib/validators';
import { syncNoteReminderJob } from '@/lib/note-reminders';
import { resolveAccessibleUserIds } from '@/lib/user-identity';

type NoteRow = {
 id: string;
 user_id: string;
 title: string;
 content: string;
 reminder_at: string | null;
 meeting_at: string | null;
 created_at: string;
 updated_at: string;
};

function toClient(row: NoteRow) {
 return {
 id: row.id,
 title: row.title,
 content: row.content,
 reminderAt: row.reminder_at,
 meetingAt: row.meeting_at,
 createdAt: row.created_at,
 updatedAt: row.updated_at,
 };
}

export async function GET(_: Request, { params }: { params: Promise<{ noteId: string }> }) {
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { noteId } = await params;
 const admin = createAdminClient();
 const ownerIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const query = await admin
 .from('notes')
 .select('id,user_id,title,content,reminder_at,meeting_at,created_at,updated_at')
 .eq('id', noteId)
 .in('user_id', ownerIds)
 .maybeSingle();

 if (query.error) {
 return NextResponse.json({ error: query.error.message }, { status: 400 });
 }
 if (!query.data?.id) {
 return NextResponse.json({ error: 'Note not found' }, { status: 404 });
 }

 return NextResponse.json({ note: toClient(query.data as NoteRow) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ noteId: string }> }) {
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const payload = await req.json().catch(() => ({}));
 const parsed = noteUpdateSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
 }

 const { noteId } = await params;
 const admin = createAdminClient();
 const ownerIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const nowIso = new Date().toISOString();
 const query = await admin
 .from('notes')
 .update({
 title: parsed.data.title,
 content: parsed.data.content,
 reminder_at: parsed.data.reminderAt,
 meeting_at: parsed.data.meetingAt,
 updated_at: nowIso,
 })
 .eq('id', noteId)
 .in('user_id', ownerIds)
 .select('id,user_id,title,content,reminder_at,meeting_at,created_at,updated_at')
 .maybeSingle();

 if (query.error) {
 return NextResponse.json({ error: query.error.message }, { status: 400 });
 }
 if (!query.data?.id) {
 return NextResponse.json({ error: 'Note not found' }, { status: 404 });
 }

 await syncNoteReminderJob({
 noteId: String(query.data.id),
 userId: String(query.data.user_id ?? auth.user.id),
 reminderAt: parsed.data.reminderAt,
 meetingAt: parsed.data.meetingAt,
 });

 await logAudit('note_updated', {
 note_id: query.data.id,
 title: query.data.title,
 });

 return NextResponse.json({ note: toClient(query.data as NoteRow) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ noteId: string }> }) {
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { noteId } = await params;
 const admin = createAdminClient();
 const ownerIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });

 const current = await admin
 .from('notes')
 .select('id,title')
 .eq('id', noteId)
 .in('user_id', ownerIds)
 .maybeSingle();

 if (current.error) {
 return NextResponse.json({ error: current.error.message }, { status: 400 });
 }
 if (!current.data?.id) {
 return NextResponse.json({ error: 'Note not found' }, { status: 404 });
 }

 const deleted = await admin.from('notes').delete().eq('id', noteId).in('user_id', ownerIds);
 if (deleted.error) {
 return NextResponse.json({ error: deleted.error.message }, { status: 400 });
 }

 await logAudit('note_deleted', {
 note_id: noteId,
 title: current.data.title,
 });

 return NextResponse.json({ ok: true });
}
