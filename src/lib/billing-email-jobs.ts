import { createAdminClient } from '@/lib/supabase/admin';
import { sendBillingDocumentEmail } from '@/lib/billing-email-notifications';
import { formatCurrency, normalizeBillingLines, safeCurrencyNumber, type BillingDocumentView } from '@/lib/billing';
import { buildBillingPdfBuffer } from '@/lib/billing-pdf';
import { queueRecurringMonthlyJobs } from '@/lib/billing-automation';

type BillingJobStatus = 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';

type BillingEmailJobRow = {
  id: number;
  billing_document_id: string;
  user_id: string;
  status: BillingJobStatus;
  job_type: 'manual' | 'due_before' | 'due_after' | 'monthly';
  to_email: string;
  subject: string | null;
  message: string | null;
  scheduled_at: string;
  sent_at: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
};

type BillingDocumentRow = {
  id: string;
  share_token: string;
  user_id: string;
  doc_kind: 'receipt' | 'invoice';
  template: 'a4' | '80mm';
  document_no: string;
  reference_no: string | null;
  issue_date: string;
  due_date: string | null;
  seller_name: string;
  seller_address: string | null;
  seller_tax_id: string | null;
  buyer_name: string;
  buyer_address: string | null;
  buyer_tax_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  payment_method: string | null;
  note_message: string | null;
  discount_percent: number | string | null;
  vat_percent: number | string | null;
  grand_total: number | string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  vat_amount: number | string | null;
  currency: string | null;
  lines_json: unknown;
  email_to: string | null;
  email_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessBillingEmailSummary = {
  ok: boolean;
  fetched: number;
  processed: number;
  sent: number;
  retried: number;
  cancelled: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function clampBatchSize(raw: number | undefined) {
  const value = Number(raw ?? 40);
  if (!Number.isFinite(value)) return 40;
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown error');
}

function buildBaseUrl() {
  const raw = String(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.CAPACITOR_SERVER_URL ||
    '',
  ).trim();

  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function safeCurrencyValue(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function buildExportUrl(input: { baseUrl: string; documentId: string; token: string; template: 'a4' | '80mm' }) {
  if (!input.baseUrl) return '';
  return (
    input.baseUrl +
    '/api/billing/documents/' +
    encodeURIComponent(input.documentId) +
    '/export?template=' +
    encodeURIComponent(input.template) +
    '&token=' +
    encodeURIComponent(input.token) +
    '&print=1'
  );
}

async function markJob(
  id: number,
  payload: Partial<{
    status: BillingJobStatus;
    sent_at: string | null;
    next_retry_at: string;
    last_error: string | null;
  }>,
) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const updated = await admin
    .from('billing_email_jobs')
    .update({
      ...payload,
      updated_at: nowIso,
    })
    .eq('id', id);
  if (updated.error) {
    throw new Error(updated.error.message);
  }
}

async function claimJob(job: BillingEmailJobRow) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const claimed = await admin
    .from('billing_email_jobs')
    .update({
      status: 'processing',
      attempt_count: job.attempt_count + 1,
      updated_at: nowIso,
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id,billing_document_id,user_id,status,job_type,to_email,subject,message,scheduled_at,sent_at,attempt_count,max_attempts,next_retry_at,created_at,updated_at')
    .maybeSingle();

  if (claimed.error) {
    throw new Error(claimed.error.message);
  }
  return (claimed.data ?? null) as BillingEmailJobRow | null;
}

async function loadDocument(job: BillingEmailJobRow) {
  const admin = createAdminClient();
  const query = await admin
    .from('billing_documents')
    .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,subtotal,discount_amount,vat_amount,grand_total,currency,lines_json,email_to,email_message,created_at,updated_at')
    .eq('id', job.billing_document_id)
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (query.error) {
    throw new Error(query.error.message);
  }
  return (query.data ?? null) as BillingDocumentRow | null;
}

function toBillingDocumentView(row: BillingDocumentRow): BillingDocumentView {
  return {
    id: row.id,
    shareToken: row.share_token,
    userId: row.user_id,
    docKind: row.doc_kind,
    template: row.template,
    documentNo: row.document_no,
    referenceNo: row.reference_no ?? '',
    issueDate: row.issue_date,
    dueDate: row.due_date,
    sellerName: row.seller_name,
    sellerAddress: row.seller_address ?? '',
    sellerTaxId: row.seller_tax_id ?? '',
    buyerName: row.buyer_name,
    buyerAddress: row.buyer_address ?? '',
    buyerTaxId: row.buyer_tax_id ?? '',
    contactName: row.contact_name ?? '',
    contactPhone: row.contact_phone ?? '',
    paymentMethod: row.payment_method ?? '',
    noteMessage: row.note_message ?? '',
    discountPercent: safeCurrencyNumber(row.discount_percent),
    vatPercent: safeCurrencyNumber(row.vat_percent),
    currency: row.currency ?? 'THB',
    subtotal: safeCurrencyNumber(row.subtotal),
    discountAmount: safeCurrencyNumber(row.discount_amount),
    vatAmount: safeCurrencyNumber(row.vat_amount),
    grandTotal: safeCurrencyNumber(row.grand_total),
    lines: normalizeBillingLines(row.lines_json),
    emailTo: row.email_to ?? '',
    emailMessage: row.email_message ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function processBillingEmailJobs(options?: { batchSize?: number }): Promise<ProcessBillingEmailSummary> {
  const batchSize = clampBatchSize(options?.batchSize);
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const baseUrl = buildBaseUrl();

  await queueRecurringMonthlyJobs(admin);

  const selected = await admin
    .from('billing_email_jobs')
    .select('id,billing_document_id,user_id,status,job_type,to_email,subject,message,scheduled_at,sent_at,attempt_count,max_attempts,next_retry_at,created_at,updated_at')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .lte('next_retry_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize);

  if (selected.error) {
    return {
      ok: false,
      fetched: 0,
      processed: 0,
      sent: 0,
      retried: 0,
      cancelled: 0,
      failed: 0,
      skipped: 0,
      errors: [selected.error.message],
    };
  }

  const jobs = (selected.data ?? []) as BillingEmailJobRow[];
  const summary: ProcessBillingEmailSummary = {
    ok: true,
    fetched: jobs.length,
    processed: 0,
    sent: 0,
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
      const document = await loadDocument(job);
      if (!document?.id) {
        await markJob(job.id, { status: 'cancelled', last_error: 'Document not found' });
        summary.cancelled += 1;
        continue;
      }
      const documentView = toBillingDocumentView(document);

      const token = String(document.share_token || '');
      const a4ExportUrl = buildExportUrl({
        baseUrl,
        documentId: document.id,
        token,
        template: 'a4',
      });
      const thermalExportUrl = buildExportUrl({
        baseUrl,
        documentId: document.id,
        token,
        template: '80mm',
      });

      const a4Pdf = await buildBillingPdfBuffer({
        document: documentView,
        template: 'a4',
      });
      const thermalPdf = await buildBillingPdfBuffer({
        document: documentView,
        template: '80mm',
      });

      const result = await sendBillingDocumentEmail({
        toEmail: String(job.to_email || '').trim().toLowerCase(),
        customerName: String(documentView.buyerName || ''),
        billType: document.doc_kind,
        documentNo: String(document.document_no || ''),
        issueDate: String(document.issue_date || ''),
        dueDate: document.due_date ? String(document.due_date) : null,
        sellerName: String(documentView.sellerName || ''),
        grandTotal: safeCurrencyValue(documentView.grandTotal),
        currency: String(documentView.currency || 'THB'),
        customMessage: String(job.message || ''),
        a4ExportUrl,
        thermalExportUrl,
        attachments: [
          {
            filename: (document.document_no || 'billing-document') + '-A4.pdf',
            contentBase64: a4Pdf.toString('base64'),
            contentType: 'application/pdf',
          },
          {
            filename: (document.document_no || 'billing-document') + '-80mm.pdf',
            contentBase64: thermalPdf.toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      });

      if (result.ok) {
        await markJob(job.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        });
        summary.sent += 1;
        continue;
      }

      const nextAttemptCount = job.attempt_count + 1;
      const errorMessage =
        String(result.error || 'Unable to send billing email') +
        ' | amount=' +
        formatCurrency(safeCurrencyValue(document.grand_total));

      if (result.skipped || nextAttemptCount >= job.max_attempts) {
        await markJob(job.id, {
          status: result.skipped ? 'cancelled' : 'failed',
          last_error: errorMessage,
        });
        if (result.skipped) {
          summary.cancelled += 1;
        } else {
          summary.failed += 1;
        }
        continue;
      }

      const backoffSec = Math.min(900, Math.max(45, nextAttemptCount * 60));
      const retryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
      await markJob(job.id, {
        status: 'pending',
        next_retry_at: retryAt,
        last_error: errorMessage,
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
