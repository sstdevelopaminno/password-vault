import { createAdminClient } from '@/lib/supabase/admin';
import { enqueuePushNotification } from '@/lib/push-queue';

type ReminderJobStatus = 'pending' | 'processing' | 'queued' | 'cancelled' | 'failed';

type ReminderJobRow = {
 id: number;
 note_id: string;
 user_id: string;
 reminder_at: string;
 status: ReminderJobStatus;
 attempt_count: number;
 max_attempts: number;
 next_retry_at: string;
};

type NoteRow = {
 id: string;
 user_id: string;
 title: string;
 reminder_at: string | null;
};

export type ProcessNoteReminderSummary = {
 ok: boolean;
 fetched: number;
 processed: number;
 queued: number;
 retried: number;
 cancelled: number;
 failed: number;
 skipped: number;
 errors: string[];
};

function toIsoOrNull(input: string | null | undefined) {
 if (!input) return null;
 const parsed = new Date(input);
 if (Number.isNaN(parsed.getTime())) return null;
 return parsed.toISOString();
}

function clampBatchSize(raw: number | undefined) {
 const value = Number(raw ?? 40);
 if (!Number.isFinite(value)) return 40;
 return Math.min(200, Math.max(1, Math.floor(value)));
}

function normalizeError(error: unknown) {
 if (error instanceof Error) return error.message;
 return String(error ?? 'Unknown error');
}

export async function syncNoteReminderJob(input: {
 noteId: string;
 userId: string;
 reminderAt: string | null;
}) {
 const admin = createAdminClient();
 const nowIso = new Date().toISOString();
 const nextReminder = toIsoOrNull(input.reminderAt);

 if (!nextReminder) {
 await admin
 .from('note_reminder_jobs')
 .update({
 status: 'cancelled',
 updated_at: nowIso,
 last_error: 'Reminder removed',
 })
 .eq('note_id', input.noteId)
 .in('status', ['pending', 'processing']);
 return;
 }

 await admin
 .from('note_reminder_jobs')
 .update({
 status: 'cancelled',
 updated_at: nowIso,
 last_error: 'Reminder rescheduled',
 })
 .eq('note_id', input.noteId)
 .neq('reminder_at', nextReminder)
 .in('status', ['pending', 'processing']);

 const existing = await admin
 .from('note_reminder_jobs')
 .select('id')
 .eq('note_id', input.noteId)
 .eq('status', 'pending')
 .eq('reminder_at', nextReminder)
 .maybeSingle();

 if (existing.error) {
 throw new Error(existing.error.message);
 }
 if (existing.data?.id) {
 return;
 }

 const inserted = await admin.from('note_reminder_jobs').insert({
 note_id: input.noteId,
 user_id: input.userId,
 reminder_at: nextReminder,
 status: 'pending',
 attempt_count: 0,
 max_attempts: 8,
 next_retry_at: nextReminder,
 updated_at: nowIso,
 });

 if (inserted.error && inserted.error.code !== '23505') {
 throw new Error(inserted.error.message);
 }
}

async function markJob(
 id: number,
 payload: Partial<{
 status: ReminderJobStatus;
 push_queue_id: number | null;
 next_retry_at: string;
 last_error: string | null;
 }>,
) {
 const admin = createAdminClient();
 const nowIso = new Date().toISOString();
 const query = await admin
 .from('note_reminder_jobs')
 .update({
 ...payload,
 updated_at: nowIso,
 })
 .eq('id', id);
 if (query.error) {
 throw new Error(query.error.message);
 }
}

async function claimJob(job: ReminderJobRow) {
 const admin = createAdminClient();
 const nowIso = new Date().toISOString();
 const claimed = await admin
 .from('note_reminder_jobs')
 .update({
 status: 'processing',
 updated_at: nowIso,
 attempt_count: job.attempt_count + 1,
 })
 .eq('id', job.id)
 .eq('status', 'pending')
 .select('id,note_id,user_id,reminder_at,status,attempt_count,max_attempts,next_retry_at')
 .maybeSingle();

 if (claimed.error) {
 throw new Error(claimed.error.message);
 }
 return (claimed.data ?? null) as ReminderJobRow | null;
}

async function loadTargetNote(job: ReminderJobRow) {
 const admin = createAdminClient();
 const noteQuery = await admin
 .from('notes')
 .select('id,user_id,title,reminder_at')
 .eq('id', job.note_id)
 .eq('user_id', job.user_id)
 .maybeSingle();
 if (noteQuery.error) {
 throw new Error(noteQuery.error.message);
 }
 return (noteQuery.data ?? null) as NoteRow | null;
}

export async function processNoteReminderJobs(options?: { batchSize?: number }): Promise<ProcessNoteReminderSummary> {
 const batchSize = clampBatchSize(options?.batchSize);
 const admin = createAdminClient();
 const nowIso = new Date().toISOString();

 const selected = await admin
 .from('note_reminder_jobs')
 .select('id,note_id,user_id,reminder_at,status,attempt_count,max_attempts,next_retry_at')
 .eq('status', 'pending')
 .lte('reminder_at', nowIso)
 .lte('next_retry_at', nowIso)
 .order('reminder_at', { ascending: true })
 .order('id', { ascending: true })
 .limit(batchSize);

 if (selected.error) {
 return {
 ok: false,
 fetched: 0,
 processed: 0,
 queued: 0,
 retried: 0,
 cancelled: 0,
 failed: 0,
 skipped: 0,
 errors: [selected.error.message],
 };
 }

 const jobs = (selected.data ?? []) as ReminderJobRow[];
 const summary: ProcessNoteReminderSummary = {
 ok: true,
 fetched: jobs.length,
 processed: 0,
 queued: 0,
 retried: 0,
 cancelled: 0,
 failed: 0,
 skipped: 0,
 errors: [],
 };

 for (const rawJob of jobs) {
 try {
 const job = await claimJob(rawJob);
 if (!job) {
 summary.skipped += 1;
 continue;
 }

 summary.processed += 1;
 const note = await loadTargetNote(job);
 if (!note?.id) {
 await markJob(job.id, { status: 'cancelled', last_error: 'Note deleted' });
 summary.cancelled += 1;
 continue;
 }

 const jobReminder = toIsoOrNull(job.reminder_at);
 const noteReminder = toIsoOrNull(note.reminder_at);
 if (!jobReminder || !noteReminder || jobReminder !== noteReminder) {
 await markJob(job.id, { status: 'cancelled', last_error: 'Reminder no longer valid' });
 summary.cancelled += 1;
 continue;
 }

 const queued = await enqueuePushNotification({
 userId: note.user_id,
 kind: 'general',
 title: 'Note reminder',
 message: note.title,
 href: '/notes',
 priority: 7,
 tag: 'note-reminder-' + note.id + '-' + noteReminder,
 payload: {
 kind: 'note_reminder',
 noteId: note.id,
 reminderAt: noteReminder,
 },
 });

 if (queued.ok) {
 await markJob(job.id, {
 status: 'queued',
 push_queue_id: queued.id,
 last_error: null,
 });
 summary.queued += 1;
 continue;
 }

 const nextAttemptCount = job.attempt_count + 1;
 if (nextAttemptCount >= job.max_attempts) {
 await markJob(job.id, {
 status: 'failed',
 last_error: queued.error,
 });
 summary.failed += 1;
 continue;
 }

 const backoffSec = Math.min(600, Math.max(30, nextAttemptCount * 45));
 const retryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
 await markJob(job.id, {
 status: 'pending',
 next_retry_at: retryAt,
 last_error: queued.error,
 });
 summary.retried += 1;
 } catch (error) {
 summary.errors.push(normalizeError(error));
 }
 }

 if (summary.errors.length > 0) {
 summary.ok = false;
 }

 return summary;
}
