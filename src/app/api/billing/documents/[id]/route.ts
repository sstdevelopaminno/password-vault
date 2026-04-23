import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAccessibleUserIds } from '@/lib/user-identity';
import { billingDocumentCreateSchema } from '@/lib/validators';
import { computeBillingTotals, normalizeBillingLines, normalizeDateInput, normalizeText, safeCurrencyNumber } from '@/lib/billing';

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

function toClient(row: BillingDocumentRow) {
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const query = await admin
    .from('billing_documents')
    .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,currency,subtotal,discount_amount,vat_amount,grand_total,lines_json,email_to,email_message,created_at,updated_at')
    .eq('id', id)
    .in('user_id', ownerIds)
    .maybeSingle();

  if (query.error) {
    return NextResponse.json({ error: query.error.message }, { status: 400 });
  }
  if (!query.data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ document: toClient(query.data as BillingDocumentRow) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await req.json().catch(() => ({}));
  const parsed = billingDocumentCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const lines = normalizeBillingLines(parsed.data.lines);
  if (lines.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
  }

  const discountPercent = safeCurrencyNumber(parsed.data.discountPercent);
  const vatPercent = safeCurrencyNumber(parsed.data.vatPercent);
  const totals = computeBillingTotals(lines, discountPercent, vatPercent);
  const nowIso = new Date().toISOString();

  const updated = await admin
    .from('billing_documents')
    .update({
      doc_kind: parsed.data.docKind,
      template: parsed.data.template,
      document_no: normalizeText(parsed.data.documentNo, 80),
      reference_no: normalizeText(parsed.data.referenceNo || '', 80) || null,
      issue_date: normalizeDateInput(parsed.data.issueDate),
      due_date: normalizeDateInput(parsed.data.dueDate) || null,
      seller_name: normalizeText(parsed.data.sellerName, 140),
      seller_address: normalizeText(parsed.data.sellerAddress || '', 400) || null,
      seller_tax_id: normalizeText(parsed.data.sellerTaxId || '', 80) || null,
      buyer_name: normalizeText(parsed.data.buyerName, 140),
      buyer_address: normalizeText(parsed.data.buyerAddress || '', 400) || null,
      buyer_tax_id: normalizeText(parsed.data.buyerTaxId || '', 80) || null,
      contact_name: normalizeText(parsed.data.contactName || '', 120) || null,
      contact_phone: normalizeText(parsed.data.contactPhone || '', 60) || null,
      payment_method: normalizeText(parsed.data.paymentMethod || '', 80) || null,
      note_message: normalizeText(parsed.data.noteMessage || '', 1000) || null,
      discount_percent: discountPercent,
      vat_percent: vatPercent,
      currency: normalizeText(parsed.data.currency || 'THB', 12) || 'THB',
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      vat_amount: totals.vatAmount,
      grand_total: totals.grandTotal,
      lines_json: lines,
      email_to: normalizeText(parsed.data.emailTo || '', 220) || null,
      email_message: normalizeText(parsed.data.emailMessage || '', 1000) || null,
      updated_at: nowIso,
    })
    .eq('id', id)
    .in('user_id', ownerIds)
    .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,currency,subtotal,discount_amount,vat_amount,grand_total,lines_json,email_to,email_message,created_at,updated_at')
    .maybeSingle();

  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 400 });
  }
  if (!updated.data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ document: toClient(updated.data as BillingDocumentRow) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const deleted = await admin
    .from('billing_documents')
    .delete()
    .eq('id', id)
    .in('user_id', ownerIds)
    .select('id')
    .maybeSingle();

  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 400 });
  }
  if (!deleted.data?.id) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ deletedId: deleted.data.id });
}
