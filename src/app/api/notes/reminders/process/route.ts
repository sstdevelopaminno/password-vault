import { NextResponse } from 'next/server';
import { processNoteReminderJobs } from '@/lib/note-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseBatch(raw: string | null | undefined) {
 const value = Number(raw ?? 50);
 if (!Number.isFinite(value)) return 50;
 return Math.min(200, Math.max(1, Math.floor(value)));
}

function hasValidSecret(req: Request) {
 const expected = process.env.NOTES_REMINDER_CRON_SECRET || process.env.CRON_SECRET || '';
 if (!expected) return process.env.NODE_ENV !== 'production';
 const viaHeader = req.headers.get('x-notes-cron-secret') ?? '';
 const authorization = req.headers.get('authorization') ?? '';
 const bearer = authorization.toLowerCase().startsWith('bearer ')
 ? authorization.slice(7).trim()
 : '';
 return viaHeader === expected || bearer === expected;
}

export async function GET(req: Request) {
 if (!hasValidSecret(req)) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(req.url);
 const batchSize = parseBatch(searchParams.get('batch'));
 const summary = await processNoteReminderJobs({ batchSize });
 return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export async function POST(req: Request) {
 if (!hasValidSecret(req)) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const payload = await req.json().catch(() => ({}));
 const batchSize = parseBatch(String((payload as { batchSize?: number }).batchSize ?? 50));
 const summary = await processNoteReminderJobs({ batchSize });
 return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
