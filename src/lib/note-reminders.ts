import { createAdminClient } from '@/lib/supabase/admin';
import { enqueuePushNotification } from '@/lib/push-queue';
import { sendNoteReminderEmail } from '@/lib/email-notifications';

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
 meeting_at: string | null;
};

type ReminderRecipientRow = {
 email: string | null;
};

export type ProcessNoteReminderSummary = {
 ok: boolean;
 fetched: number;
 processed: number;
 queued: number;
 emailSent: number;
 emailFailed: number;
 emailSkipped: number;
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

function uniqueIsoReminderTimes(values: Array<string | null | undefined>) {
 const seen = new Set<string>();
 for (const value of values) {
 const iso = toIsoOrNull(value);
 if (iso) seen.add(iso);
 }
 return Array.from(seen.values()).sort();
}

export async function syncNoteReminderJob(input: {
 noteId: string;
 userId: string;
 reminderAt: string | null;
 meetingAt?: string | null;
}) {
 const admin = createAdminClient();
 const nowIso = new Date().toISOString();
 const expectedReminders = uniqueIsoReminderTimes([input.reminderAt, input.meetingAt]);
 const activeJobsQuery = await admin
 .from('note_reminder_jobs')
 .select('id,reminder_at,status')
 .eq('note_id', input.noteId)
 .in('status', ['pending', 'processing']);

 if (activeJobsQuery.error) {
 throw new Error(activeJobsQuery.error.message);
 }

 const activeJobs = (activeJobsQuery.data ?? []) as Array<{
 id: number;
 reminder_at: string;
 status: ReminderJobStatus;
 }>;

 if (expectedReminders.length === 0) {
 const activeIds = activeJobs.map((job) => Number(job.id)).filter((id) => Number.isFinite(id));
 if (activeIds.length > 0) {
 const cancelled = await admin
 .from('note_reminder_jobs')
 .update({
 status: 'cancelled',
 updated_at: nowIso,
 last_error: 'Reminder removed',
 })
 .in('id', activeIds);
 if (cancelled.error) {
 throw new Error(cancelled.error.message);
 }
 }
 return;
 }

 const expectedSet = new Set(expectedReminders);
 const obsoleteJobIds = activeJobs
 .filter((job) => {
 const current = toIsoOrNull(job.reminder_at);
 return !current || !expectedSet.has(current);
 })
 .map((job) => Number(job.id))
 .filter((id) => Number.isFinite(id));

 if (obsoleteJobIds.length > 0) {
 const cancelled = await admin
 .from('note_reminder_jobs')
 .update({
 status: 'cancelled',
 updated_at: nowIso,
 last_error: 'Reminder rescheduled',
 })
 .in('id', obsoleteJobIds);
 if (cancelled.error) {
 throw new Error(cancelled.error.message);
 }
 }

 const activeReminderSet = new Set(
 activeJobs
 .map((job) => toIsoOrNull(job.reminder_at))
 .filter((value): value is string => Boolean(value)),
 );

 for (const reminderAt of expectedReminders) {
 if (activeReminderSet.has(reminderAt)) continue;
 const inserted = await admin.from('note_reminder_jobs').insert({
 note_id: input.noteId,
 user_id: input.userId,
 reminder_at: reminderAt,
 status: 'pending',
 attempt_count: 0,
 max_attempts: 8,
 next_retry_at: reminderAt,
 updated_at: nowIso,
 });
 if (inserted.error && inserted.error.code !== '23505') {
 throw new Error(inserted.error.message);
 }
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
 .select('id,user_id,title,reminder_at,meeting_at')
 .eq('id', job.note_id)
 .eq('user_id', job.user_id)
 .maybeSingle();
 if (noteQuery.error) {
 throw new Error(noteQuery.error.message);
 }
 return (noteQuery.data ?? null) as NoteRow | null;
}

async function loadReminderRecipient(job: ReminderJobRow) {
 const admin = createAdminClient();
 const recipientQuery = await admin
 .from('profiles')
 .select('email')
 .eq('id', job.user_id)
 .maybeSingle();
 if (recipientQuery.error) {
 throw new Error(recipientQuery.error.message);
 }
 return (recipientQuery.data ?? null) as ReminderRecipientRow | null;
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
 emailSent: 0,
 emailFailed: 0,
 emailSkipped: 0,
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
 emailSent: 0,
 emailFailed: 0,
 emailSkipped: 0,
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
 const recipient = await loadReminderRecipient(job);
 if (!note?.id) {
 await markJob(job.id, { status: 'cancelled', last_error: 'Note deleted' });
 summary.cancelled += 1;
 continue;
 }

 const jobReminder = toIsoOrNull(job.reminder_at);
 const reminderCandidates = uniqueIsoReminderTimes([note.reminder_at, note.meeting_at]);
 const reminderCandidateSet = new Set(reminderCandidates);
 if (!jobReminder || !reminderCandidateSet.has(jobReminder)) {
 await markJob(job.id, { status: 'cancelled', last_error: 'Reminder no longer valid' });
 summary.cancelled += 1;
 continue;
 }

 const noteReminder = toIsoOrNull(note.reminder_at);
 const noteMeeting = toIsoOrNull(note.meeting_at);
 const dueKind =
 noteReminder === jobReminder && noteMeeting === jobReminder
 ? 'meeting_and_reminder'
 : noteMeeting === jobReminder
 ? 'meeting'
 : 'reminder';
 const pushTitle = dueKind === 'meeting' ? 'Meeting reminder' : 'Note reminder';

 const pushQueued = await enqueuePushNotification({
 userId: note.user_id,
 kind: 'general',
 title: pushTitle,
 message: note.title,
 href: '/notes',
 priority: 7,
 tag: 'note-reminder-' + note.id + '-' + dueKind + '-' + jobReminder,
 payload: {
 kind: 'note_reminder',
 noteId: note.id,
 reminderAt: jobReminder,
 dueKind: dueKind,
 },
 });

 const targetEmail = String(recipient?.email ?? '').trim().toLowerCase();
 let emailResult: { ok: boolean; skipped?: boolean; error?: string };

 if (!targetEmail) {
 emailResult = { ok: false, skipped: true, error: 'Missing profile email' };
 summary.emailSkipped += 1;
 } else {
 const sent = await sendNoteReminderEmail({
 toEmail: targetEmail,
 noteTitle: note.title,
 noteId: note.id,
 reminderAt: jobReminder,
 });
 emailResult = sent;
 if (sent.ok) {
 summary.emailSent += 1;
 } else if (sent.skipped) {
 summary.emailSkipped += 1;
 } else {
 summary.emailFailed += 1;
 }
 }

 const pushOk = pushQueued.ok;
 if (pushOk || emailResult.ok) {
 const deliveryErrors: string[] = [];
 if (!pushOk) {
 deliveryErrors.push('push:' + String(pushQueued.error ?? 'queue failed'));
 }
 if (!emailResult.ok) {
 deliveryErrors.push('email:' + String(emailResult.error ?? 'send failed'));
 }

 await markJob(job.id, {
 status: 'queued',
 push_queue_id: pushOk ? pushQueued.id : null,
 last_error: deliveryErrors.length > 0 ? deliveryErrors.join(' | ') : null,
 });
 summary.queued += 1;
 continue;
 }

 const nextAttemptCount = job.attempt_count + 1;
 const combinedError = 'push:' + String(pushQueued.error ?? 'queue failed') + ' | email:' + String(emailResult.error ?? 'send failed');
 if (nextAttemptCount >= job.max_attempts) {
 await markJob(job.id, {
 status: 'failed',
 last_error: combinedError,
 });
 summary.failed += 1;
 continue;
 }

 const backoffSec = Math.min(600, Math.max(30, nextAttemptCount * 45));
 const retryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
 await markJob(job.id, {
 status: 'pending',
 next_retry_at: retryAt,
 last_error: combinedError,
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
