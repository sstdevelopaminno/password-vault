import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type NoteRow = {
 id: string;
 title: string;
 content: string;
 reminder_at: string | null;
 meeting_at: string | null;
 updated_at: string;
};

function safeFilename(input: string) {
 return input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'note';
}

function escapeHtml(input: string) {
 return input
 .replaceAll('&', '&amp;')
 .replaceAll('<', '&lt;')
 .replaceAll('>', '&gt;')
 .replaceAll('"', '&quot;')
 .replaceAll("'", '&#39;');
}

function formatDate(raw: string | null, locale: string) {
 if (!raw) return '-';
 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return '-';
 return date.toLocaleString(locale);
}

async function loadNote(noteId: string, userId: string) {
 const admin = createAdminClient();
 const query = await admin
 .from('notes')
 .select('id,title,content,reminder_at,meeting_at,updated_at')
 .eq('id', noteId)
 .eq('user_id', userId)
 .maybeSingle();
 if (query.error) throw new Error(query.error.message);
 return (query.data ?? null) as NoteRow | null;
}

export async function GET(req: Request, { params }: { params: Promise<{ noteId: string }> }) {
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { noteId } = await params;
 const note = await loadNote(noteId, auth.user.id);
 if (!note) {
 return NextResponse.json({ error: 'Note not found' }, { status: 404 });
 }

 const { searchParams } = new URL(req.url);
 const format = String(searchParams.get('format') ?? 'txt').toLowerCase();
 const locale = String(searchParams.get('locale') ?? 'th-TH');
 const wantsPrint = searchParams.get('print') === '1';
 const filenameBase = safeFilename(note.title);

 if (format === 'pdf') {
 const html = [
 '<!doctype html>',
 '<html lang="' + (locale.startsWith('th') ? 'th' : 'en') + '">',
 '<head>',
 '<meta charset="utf-8" />',
 '<meta name="viewport" content="width=device-width, initial-scale=1" />',
 '<title>' + escapeHtml(note.title) + '</title>',
 '<style>',
 '@page { size: A4; margin: 14mm; }',
 'body { font-family: "Segoe UI", "Noto Sans Thai", sans-serif; color: #0f172a; background: #f8fafc; }',
 '.sheet { background: #fff; border: 1px solid #cbd5e1; border-radius: 14px; padding: 18px; min-height: 82vh; }',
 'h1 { margin: 0 0 10px; font-size: 22px; line-height: 1.3; }',
 '.meta { margin-bottom: 14px; color: #475569; font-size: 12px; line-height: 1.6; }',
 '.content { white-space: pre-wrap; font-size: 14px; line-height: 1.75; }',
 '.toolbar { margin: 14px auto; max-width: 700px; display: flex; justify-content: flex-end; }',
 '.btn { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 10px; padding: 8px 14px; font-weight: 600; cursor: pointer; }',
 '@media print { .toolbar { display: none; } body { background: #fff; } .sheet { border: none; border-radius: 0; padding: 0; min-height: auto; } }',
 '</style>',
 '</head>',
 '<body>',
 '<div class="toolbar"><button class="btn" onclick="window.print()">' + (locale.startsWith('th') ? 'พิมพ์ / บันทึก PDF' : 'Print / Save PDF') + '</button></div>',
 '<article class="sheet">',
 '<h1>' + escapeHtml(note.title) + '</h1>',
 '<div class="meta">' +
 (locale.startsWith('th') ? 'อัปเดตล่าสุด' : 'Updated') + ': ' + escapeHtml(formatDate(note.updated_at, locale)) + '<br />' +
 (locale.startsWith('th') ? 'เตือนความจำ' : 'Reminder') + ': ' + escapeHtml(formatDate(note.reminder_at, locale)) + '<br />' +
 (locale.startsWith('th') ? 'นัดหมาย' : 'Meeting') + ': ' + escapeHtml(formatDate(note.meeting_at, locale)) +
 '</div>',
 '<div class="content">' + escapeHtml(note.content) + '</div>',
 '</article>',
 wantsPrint ? '<script>setTimeout(function(){ window.print(); }, 180);</script>' : '',
 '</body>',
 '</html>',
 ].join('');

 return new NextResponse(html, {
 status: 200,
 headers: {
 'Content-Type': 'text/html; charset=utf-8',
 'Content-Disposition': 'inline; filename="' + filenameBase + '.html"',
 'Cache-Control': 'no-store',
 },
 });
 }

 const textBody = [
 note.title,
 '',
 note.content,
 '',
 '---',
 'Updated: ' + formatDate(note.updated_at, locale),
 'Reminder: ' + formatDate(note.reminder_at, locale),
 'Meeting: ' + formatDate(note.meeting_at, locale),
 ].join('\n');

 return new NextResponse(textBody, {
 status: 200,
 headers: {
 'Content-Type': 'text/plain; charset=utf-8',
 'Content-Disposition': 'attachment; filename="' + filenameBase + '.txt"',
 'Cache-Control': 'no-store',
 },
 });
}
