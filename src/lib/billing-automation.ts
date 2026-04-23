import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingDocKind } from '@/lib/billing';

export type BillingDocLike = {
  id: string;
  userId: string;
  docKind: BillingDocKind;
  documentNo: string;
  dueDate: string | null;
  emailTo: string;
  emailMessage: string;
  paymentStatus: 'unpaid' | 'paid';
  autoReminderEnabled: boolean;
  reminderBeforeDays: number;
  reminderAfterDays: number;
  recurringEmailEnabled: boolean;
  recurringDayOfMonth: number | null;
  lastRecurringQueuedOn: string | null;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toUtcDate(input: string) {
  const date = new Date(input + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcDate(input: Date) {
  return input.getUTCFullYear() + '-' + pad2(input.getUTCMonth() + 1) + '-' + pad2(input.getUTCDate());
}

function plusDays(dateOnly: string, days: number) {
  const date = toUtcDate(dateOnly);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function toBangkokDate(now = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return formatted;
}

function scheduledIsoFromDate(dateOnly: string) {
  // 09:00 Asia/Bangkok == 02:00 UTC
  return new Date(dateOnly + 'T02:00:00.000Z').toISOString();
}

export function buildDocumentNo(kind: BillingDocKind) {
  const prefix = kind === 'receipt' ? 'RE' : 'INV';
  const now = new Date();
  const datePart =
    String(now.getUTCFullYear()) +
    pad2(now.getUTCMonth() + 1) +
    pad2(now.getUTCDate()) +
    pad2(now.getUTCHours()) +
    pad2(now.getUTCMinutes());
  const randomPart = String(Math.floor(100 + Math.random() * 900));
  return prefix + datePart + randomPart;
}

export async function queueAutoReminderJobs(admin: SupabaseClient, document: BillingDocLike) {
  const email = String(document.emailTo || '').trim().toLowerCase();
  if (!document.id || !email || !document.dueDate || document.docKind !== 'invoice') return;
  if (!document.autoReminderEnabled || document.paymentStatus === 'paid') return;

  await admin
    .from('billing_email_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString(), last_error: 'Replaced by latest schedule' })
    .eq('billing_document_id', document.id)
    .in('status', ['pending', 'processing'])
    .in('job_type', ['due_before', 'due_after']);

  const beforeDate = plusDays(document.dueDate, -Math.max(0, Math.floor(document.reminderBeforeDays || 0)));
  const afterDate = plusDays(document.dueDate, Math.max(0, Math.floor(document.reminderAfterDays || 0)));
  const now = Date.now();
  const rows: Array<Record<string, unknown>> = [];

  if (beforeDate) {
    const beforeIso = scheduledIsoFromDate(beforeDate);
    if (new Date(beforeIso).getTime() >= now - 60_000) {
      rows.push({
        billing_document_id: document.id,
        user_id: document.userId,
        status: 'pending',
        job_type: 'due_before',
        to_email: email,
        subject: 'แจ้งเตือนกำหนดชำระ #' + document.documentNo,
        message:
          String(document.emailMessage || '').trim() ||
          'เอกสาร #' + document.documentNo + ' จะครบกำหนดชำระในวันที่ ' + document.dueDate,
        scheduled_at: beforeIso,
        next_retry_at: beforeIso,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (afterDate) {
    const afterIso = scheduledIsoFromDate(afterDate);
    const normalizedAfterIso = new Date(afterIso).getTime() < now ? new Date(now + 2 * 60_000).toISOString() : afterIso;
    rows.push({
      billing_document_id: document.id,
      user_id: document.userId,
      status: 'pending',
      job_type: 'due_after',
      to_email: email,
      subject: 'ติดตามการชำระ #' + document.documentNo,
      message:
        String(document.emailMessage || '').trim() ||
        'เอกสาร #' + document.documentNo + ' ครบกำหนดชำระแล้วเมื่อวันที่ ' + document.dueDate,
      scheduled_at: normalizedAfterIso,
      next_retry_at: normalizedAfterIso,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return;
  await admin.from('billing_email_jobs').insert(rows);
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function parseDateOnly(input: string | null | undefined) {
  const raw = String(input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export async function queueRecurringMonthlyJobs(admin: SupabaseClient) {
  const todayBkk = toBangkokDate();
  const [yearRaw, monthRaw, dayRaw] = todayBkk.split('-').map((value) => Number(value));
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return;

  const query = await admin
    .from('billing_documents')
    .select('id,user_id,doc_kind,document_no,email_to,email_message,payment_status,recurring_email_enabled,recurring_day_of_month,last_recurring_queued_on')
    .eq('recurring_email_enabled', true)
    .eq('payment_status', 'unpaid')
    .not('email_to', 'is', null)
    .limit(500);

  if (query.error || !Array.isArray(query.data) || query.data.length === 0) return;

  for (const row of query.data as Array<Record<string, unknown>>) {
    const recurringDay = Number(row.recurring_day_of_month || 0);
    if (!Number.isFinite(recurringDay) || recurringDay < 1 || recurringDay > 31) continue;

    const cappedDay = Math.min(recurringDay, daysInMonth(year, month));
    if (day !== cappedDay) continue;

    const lastQueued = parseDateOnly(String(row.last_recurring_queued_on || ''));
    if (lastQueued === todayBkk) continue;

    const documentId = String(row.id || '').trim();
    const userId = String(row.user_id || '').trim();
    const toEmail = String(row.email_to || '').trim().toLowerCase();
    const documentNo = String(row.document_no || '').trim();
    const kind = String(row.doc_kind || 'invoice') === 'receipt' ? 'receipt' : 'invoice';
    if (!documentId || !userId || !toEmail || !documentNo) continue;

    const scheduledAt = new Date(Date.now() + 2 * 60_000).toISOString();
    await admin.from('billing_email_jobs').insert({
      billing_document_id: documentId,
      user_id: userId,
      status: 'pending',
      job_type: 'monthly',
      to_email: toEmail,
      subject: (kind === 'receipt' ? 'ใบเสร็จรายเดือน' : 'ใบแจ้งหนี้รายเดือน') + ' #' + documentNo,
      message: String(row.email_message || '').trim() || 'เอกสารประจำเดือน #' + documentNo,
      scheduled_at: scheduledAt,
      next_retry_at: scheduledAt,
      updated_at: new Date().toISOString(),
    });

    await admin
      .from('billing_documents')
      .update({ last_recurring_queued_on: todayBkk, updated_at: new Date().toISOString() })
      .eq('id', documentId);
  }
}
