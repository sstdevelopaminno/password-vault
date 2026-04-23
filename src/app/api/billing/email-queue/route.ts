import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAccessibleUserIds } from '@/lib/user-identity';
import { billingEmailQueueCreateSchema } from '@/lib/validators';
import { normalizeText } from '@/lib/billing';

type BillingEmailJobRow = {
  id: number;
  billing_document_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
  job_type: 'manual' | 'due_before' | 'due_after' | 'monthly';
  to_email: string;
  subject: string | null;
  message: string | null;
  scheduled_at: string;
  sent_at: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function toClient(row: BillingEmailJobRow) {
  return {
    id: row.id,
    documentId: row.billing_document_id,
    userId: row.user_id,
    status: row.status,
    jobType: row.job_type,
    toEmail: row.to_email,
    subject: row.subject ?? '',
    message: row.message ?? '',
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseLimit(raw: string | null, fallback = 30, max = 100) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get('limit'));
  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const query = await admin
    .from('billing_email_jobs')
    .select('id,billing_document_id,user_id,status,job_type,to_email,subject,message,scheduled_at,sent_at,attempt_count,max_attempts,next_retry_at,last_error,created_at,updated_at')
    .in('user_id', ownerIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (query.error) {
    return NextResponse.json({ error: query.error.message }, { status: 400 });
  }

  const rows = (query.data ?? []) as BillingEmailJobRow[];
  return NextResponse.json({ jobs: rows.map(toClient) });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = billingEmailQueueCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 });
  }

  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const document = await admin
    .from('billing_documents')
    .select('id,user_id,doc_kind,document_no')
    .eq('id', parsed.data.documentId)
    .in('user_id', ownerIds)
    .maybeSingle();
  if (document.error) {
    return NextResponse.json({ error: document.error.message }, { status: 400 });
  }
  if (!document.data?.id) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const userId = String(document.data.user_id);
  const subjectPrefix = document.data.doc_kind === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้';
  const subject = subjectPrefix + ' #' + String(document.data.document_no || '');
  const message = normalizeText(parsed.data.message || '', 1000) || null;
  const nowIso = new Date().toISOString();

  const inserted = await admin
    .from('billing_email_jobs')
    .insert({
      billing_document_id: document.data.id,
      user_id: userId,
      status: 'pending',
      job_type: 'manual',
      to_email: String(parsed.data.toEmail).trim().toLowerCase(),
      subject,
      message,
      scheduled_at: scheduledAt.toISOString(),
      next_retry_at: scheduledAt.toISOString(),
      updated_at: nowIso,
    })
    .select('id,billing_document_id,user_id,status,job_type,to_email,subject,message,scheduled_at,sent_at,attempt_count,max_attempts,next_retry_at,last_error,created_at,updated_at')
    .single();

  if (inserted.error || !inserted.data) {
    return NextResponse.json({ error: inserted.error?.message ?? 'Queue insert failed' }, { status: 400 });
  }

  await admin
    .from('billing_documents')
    .update({
      email_to: String(parsed.data.toEmail).trim().toLowerCase(),
      email_message: message,
      updated_at: nowIso,
    })
    .eq('id', document.data.id);

  return NextResponse.json({ job: toClient(inserted.data as BillingEmailJobRow) });
}
