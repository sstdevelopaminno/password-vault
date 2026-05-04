import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { noteCreateSchema } from '@/lib/validators';
import { syncNoteReminderJob } from '@/lib/note-reminders';
import { pickPrimaryUserId, resolveAccessibleUserIds } from '@/lib/user-identity';
import { assertNotesQuota, collectPackageUsageSnapshot } from '@/lib/package-entitlements';

type NoteRow = {
 id: string;
 title: string;
 content: string;
 reminder_at: string | null;
 meeting_at: string | null;
 created_at: string;
 updated_at: string;
};

type NotesViewMode = 'full' | 'calendar';

type NoteCalendarRow = {
 id: string;
 title: string;
 reminder_at: string | null;
 meeting_at: string | null;
 updated_at: string;
};

function parseViewMode(raw: string | null): NotesViewMode {
 const mode = String(raw ?? '').trim().toLowerCase();
 if (mode === 'calendar') return 'calendar';
 return 'full';
}

function parseLimit(raw: string | null, fallback = 20, max = 60) {
 const value = Number(raw ?? fallback);
 if (!Number.isFinite(value)) return fallback;
 return Math.min(max, Math.max(1, Math.floor(value)));
}

function parsePage(raw: string | null, fallback = 1) {
 const value = Number(raw ?? fallback);
 if (!Number.isFinite(value)) return fallback;
 return Math.max(1, Math.floor(value));
}

function normalizeQuery(raw: string | null) {
 return String(raw ?? '')
 .normalize('NFKC')
 .replace(/\s+/g, ' ')
 .trim()
 .slice(0, 180);
}

function escapeLike(value: string) {
 return value.replace(/[%_,]/g, ' ').trim();
}

function tokenizeQuery(value: string) {
 if (!value) return [];
 return value
 .split(/\s+/)
 .map((token) => escapeLike(token))
 .filter((token) => token.length > 0)
 .slice(0, 6);
}

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

function toCalendarClient(row: NoteCalendarRow) {
 return {
 id: row.id,
 title: row.title,
 reminderAt: row.reminder_at,
 meetingAt: row.meeting_at,
 updatedAt: row.updated_at,
 };
}

export async function GET(req: Request) {
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(req.url);
 const view = parseViewMode(searchParams.get('view'));
 const limit = parseLimit(searchParams.get('limit'), view === 'calendar' ? 140 : 20, view === 'calendar' ? 200 : 60);
 const page = parsePage(searchParams.get('page'));
 const q = normalizeQuery(searchParams.get('q'));
 const from = (page - 1) * limit;
 const to = from + limit - 1;

 const admin = createAdminClient();
 const ownerIds = await resolveAccessibleUserIds({
 admin: admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 let query =
 view === 'calendar'
 ? admin
 .from('notes')
 .select('id,title,reminder_at,meeting_at,updated_at', { count: 'planned' })
 .in('user_id', ownerIds)
 .order('updated_at', { ascending: false })
 .order('id', { ascending: false })
 .range(from, to)
 : admin
 .from('notes')
 .select('id,title,content,reminder_at,meeting_at,created_at,updated_at', { count: 'planned' })
 .in('user_id', ownerIds)
 .order('updated_at', { ascending: false })
 .order('id', { ascending: false })
 .range(from, to);

 if (q) {
 const tokens = tokenizeQuery(q);
 const buildOr = (token: string) =>
 view === 'calendar'
 ? ('title.ilike.%' + token + '%')
 : ('title.ilike.%' + token + '%,content.ilike.%' + token + '%');
 if (tokens.length === 0) {
 query = query.or(buildOr(escapeLike(q)));
 } else {
 for (const token of tokens) {
 query = query.or(buildOr(token));
 }
 }
 }

 const { data, error, count } = await query;
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const rows = (data ?? []) as unknown as Array<NoteRow | NoteCalendarRow>;
 const total = Number(count ?? 0);
 const totalPages = Math.max(1, Math.ceil(total / limit));

 return NextResponse.json({
 notes: view === 'calendar'
 ? rows.map((row) => toCalendarClient(row as NoteCalendarRow))
 : rows.map((row) => toClient(row as NoteRow)),
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

export async function POST(req: Request) {
 const payload = await req.json().catch(() => ({}));
 const parsed = noteCreateSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const admin = createAdminClient();
 const ownerIds = await resolveAccessibleUserIds({
 admin: admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const ownerUserId = pickPrimaryUserId({
 authUserId: auth.user.id,
 accessibleUserIds: ownerIds,
 });
 if (!ownerUserId) {
 return NextResponse.json({ error: 'Unable to resolve user' }, { status: 400 });
 }
 try {
 await assertNotesQuota({
 admin,
 userId: ownerUserId,
 });
 } catch (error) {
 return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 409 });
 }
 const nowIso = new Date().toISOString();
 const { data, error } = await admin
 .from('notes')
 .insert({
 user_id: ownerUserId,
 title: parsed.data.title,
 content: parsed.data.content,
 reminder_at: parsed.data.reminderAt,
 meeting_at: parsed.data.meetingAt,
 updated_at: nowIso,
 })
 .select('id,title,content,reminder_at,meeting_at,created_at,updated_at')
 .single();

 if (error || !data) {
 return NextResponse.json({ error: error?.message ?? 'Create note failed' }, { status: 400 });
 }

 await syncNoteReminderJob({
 noteId: String(data.id),
 userId: ownerUserId,
 reminderAt: parsed.data.reminderAt,
 meetingAt: parsed.data.meetingAt,
 });

 await logAudit('note_created', {
 note_id: data.id,
 title: data.title,
 });
 try {
 await collectPackageUsageSnapshot({
 admin,
 userId: ownerUserId,
 includeWorkspaceBytes: false,
 });
 } catch (usageError) {
 console.error('Package usage sync failed after note create:', usageError);
 }

 return NextResponse.json({ note: toClient(data as NoteRow) });
}
