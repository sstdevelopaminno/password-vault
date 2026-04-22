import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAccessibleUserIds } from '@/lib/user-identity';
import { normalizeBillingLines, safeCurrencyNumber, type BillingDocumentView } from '@/lib/billing';
import { buildBillingPdfBuffer } from '@/lib/billing-pdf';
import { sendBillingDocumentEmail } from '@/lib/billing-email-notifications';

const sendNowSchema = z.object({
  documentId: z.uuid(),
  toEmail: z.email().optional().or(z.literal('')).transform((value) => value ?? ''),
  message: z.string().trim().max(1000).optional().or(z.literal('')).transform((value) => value ?? ''),
});

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
  currency: string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  vat_amount: number | string | null;
  grand_total: number | string | null;
  lines_json: unknown;
  email_to: string | null;
  email_message: string | null;
  created_at: string;
  updated_at: string;
};

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

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = sendNowSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const documentQuery = await admin
    .from('billing_documents')
    .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,currency,subtotal,discount_amount,vat_amount,grand_total,lines_json,email_to,email_message,created_at,updated_at')
    .eq('id', parsed.data.documentId)
    .in('user_id', ownerIds)
    .maybeSingle();

  if (documentQuery.error) {
    return NextResponse.json({ error: documentQuery.error.message }, { status: 400 });
  }
  if (!documentQuery.data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const documentRow = documentQuery.data as BillingDocumentRow;
  const document = toBillingDocumentView(documentRow);
  const toEmail = String(parsed.data.toEmail || document.emailTo || '').trim().toLowerCase();
  if (!toEmail) {
    return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
  }

  const message = String(parsed.data.message || document.emailMessage || '').trim();
  const baseUrl = buildBaseUrl();
  const token = String(document.shareToken || '');
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
    document,
    template: 'a4',
  });
  const thermalPdf = await buildBillingPdfBuffer({
    document,
    template: '80mm',
  });

  const result = await sendBillingDocumentEmail({
    toEmail,
    customerName: document.buyerName,
    billType: document.docKind,
    documentNo: document.documentNo,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    sellerName: document.sellerName,
    grandTotal: document.grandTotal,
    currency: document.currency,
    customMessage: message,
    a4ExportUrl,
    thermalExportUrl,
    attachments: [
      {
        filename: (document.documentNo || 'billing-document') + '-A4.pdf',
        contentBase64: a4Pdf.toString('base64'),
        contentType: 'application/pdf',
      },
      {
        filename: (document.documentNo || 'billing-document') + '-80mm.pdf',
        contentBase64: thermalPdf.toString('base64'),
        contentType: 'application/pdf',
      },
    ],
  });

  const nowIso = new Date().toISOString();
  const subjectPrefix = document.docKind === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้';
  const subject = subjectPrefix + ' #' + document.documentNo;

  const inserted = await admin
    .from('billing_email_jobs')
    .insert({
      billing_document_id: document.id,
      user_id: document.userId,
      status: result.ok ? 'sent' : 'failed',
      to_email: toEmail,
      subject,
      message: message || null,
      scheduled_at: nowIso,
      sent_at: result.ok ? nowIso : null,
      attempt_count: 1,
      max_attempts: 1,
      next_retry_at: nowIso,
      last_error: result.ok ? null : String(result.error || 'Unable to send billing email'),
      updated_at: nowIso,
    })
    .select('id,billing_document_id,user_id,status,to_email,subject,message,scheduled_at,sent_at,attempt_count,max_attempts,next_retry_at,last_error,created_at,updated_at')
    .single();

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Unable to send billing email', job: inserted.data }, { status: 400 });
  }

  return NextResponse.json({ ok: true, job: inserted.data });
}
