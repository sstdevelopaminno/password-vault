import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pickPrimaryUserId, resolveAccessibleUserIds } from '@/lib/user-identity';
import { billingDocumentCreateSchema } from '@/lib/validators';
import { computeBillingTotals, normalizeBillingLines, normalizeDateInput, normalizeText, safeCurrencyNumber } from '@/lib/billing';
import { buildDocumentNo, queueAutoReminderJobs } from '@/lib/billing-automation';

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
  payment_status: 'unpaid' | 'paid' | null;
  paid_at: string | null;
  auto_reminder_enabled: boolean | null;
  reminder_before_days: number | null;
  reminder_after_days: number | null;
  recurring_email_enabled: boolean | null;
  recurring_day_of_month: number | null;
  last_recurring_queued_on: string | null;
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
    paymentStatus: row.payment_status === 'paid' ? 'paid' : 'unpaid',
    paidAt: row.paid_at,
    autoReminderEnabled: row.auto_reminder_enabled !== false,
    reminderBeforeDays: Number(row.reminder_before_days ?? 1),
    reminderAfterDays: Number(row.reminder_after_days ?? 3),
    recurringEmailEnabled: row.recurring_email_enabled === true,
    recurringDayOfMonth: row.recurring_day_of_month ? Number(row.recurring_day_of_month) : null,
    lastRecurringQueuedOn: row.last_recurring_queued_on ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseLimit(raw: string | null, fallback = 20, max = 100) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function parsePage(raw: string | null, fallback = 1) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get('limit'));
  const page = parsePage(searchParams.get('page'));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const query = await admin
    .from('billing_documents')
    .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,currency,subtotal,discount_amount,vat_amount,grand_total,lines_json,email_to,email_message,payment_status,paid_at,auto_reminder_enabled,reminder_before_days,reminder_after_days,recurring_email_enabled,recurring_day_of_month,last_recurring_queued_on,created_at,updated_at', { count: 'planned' })
    .in('user_id', ownerIds)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.error) {
    return NextResponse.json({ error: query.error.message }, { status: 400 });
  }

  const rows = (query.data ?? []) as BillingDocumentRow[];
  const total = Number(query.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({
    documents: rows.map(toClient),
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
  const parsed = billingDocumentCreateSchema.safeParse(payload);
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
  const ownerUserId = pickPrimaryUserId({
    authUserId: auth.user.id,
    accessibleUserIds: ownerIds,
  });

  const lines = normalizeBillingLines(parsed.data.lines);
  if (lines.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
  }

  const discountPercent = safeCurrencyNumber(parsed.data.discountPercent);
  const vatPercent = safeCurrencyNumber(parsed.data.vatPercent);
  const paymentStatus = parsed.data.paymentStatus === 'paid' ? 'paid' : 'unpaid';
  const paidAt = paymentStatus === 'paid'
    ? parsed.data.paidAt || new Date().toISOString()
    : null;
  const autoReminderEnabled = Boolean(parsed.data.autoReminderEnabled ?? true);
  const reminderBeforeDays = Math.max(0, Math.min(30, Math.floor(Number(parsed.data.reminderBeforeDays ?? 1))));
  const reminderAfterDays = Math.max(0, Math.min(30, Math.floor(Number(parsed.data.reminderAfterDays ?? 3))));
  const recurringEmailEnabled = Boolean(parsed.data.recurringEmailEnabled ?? false);
  const recurringDayOfMonth = recurringEmailEnabled
    ? Math.max(1, Math.min(31, Math.floor(Number(parsed.data.recurringDayOfMonth ?? 1))))
    : null;
  const totals = computeBillingTotals(lines, discountPercent, vatPercent);
  const nowIso = new Date().toISOString();
  const generatedDocNo = normalizeText(parsed.data.documentNo || '', 80) || buildDocumentNo(parsed.data.docKind);
  const normalizedEmailTo = normalizeText(parsed.data.emailTo || '', 220).toLowerCase();
  const normalizedDueDate = normalizeDateInput(parsed.data.dueDate) || null;

  const inserted = await admin
    .from('billing_documents')
    .insert({
      user_id: ownerUserId,
      doc_kind: parsed.data.docKind,
      template: parsed.data.template,
      document_no: generatedDocNo,
      reference_no: normalizeText(parsed.data.referenceNo || '', 80) || null,
      issue_date: normalizeDateInput(parsed.data.issueDate),
      due_date: normalizedDueDate,
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
      email_to: normalizedEmailTo || null,
      email_message: normalizeText(parsed.data.emailMessage || '', 1000) || null,
      payment_status: paymentStatus,
      paid_at: paidAt,
      auto_reminder_enabled: autoReminderEnabled,
      reminder_before_days: reminderBeforeDays,
      reminder_after_days: reminderAfterDays,
      recurring_email_enabled: recurringEmailEnabled,
      recurring_day_of_month: recurringDayOfMonth,
      updated_at: nowIso,
    })
    .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,currency,subtotal,discount_amount,vat_amount,grand_total,lines_json,email_to,email_message,payment_status,paid_at,auto_reminder_enabled,reminder_before_days,reminder_after_days,recurring_email_enabled,recurring_day_of_month,last_recurring_queued_on,created_at,updated_at')
    .single();

  if (inserted.error || !inserted.data) {
    return NextResponse.json({ error: inserted.error?.message ?? 'Create billing document failed' }, { status: 400 });
  }

  const createdDoc = toClient(inserted.data as BillingDocumentRow);
  await queueAutoReminderJobs(admin, {
    id: createdDoc.id,
    userId: createdDoc.userId,
    docKind: createdDoc.docKind,
    documentNo: createdDoc.documentNo,
    dueDate: createdDoc.dueDate,
    emailTo: createdDoc.emailTo,
    emailMessage: createdDoc.emailMessage,
    paymentStatus: createdDoc.paymentStatus === 'paid' ? 'paid' : 'unpaid',
    autoReminderEnabled: createdDoc.autoReminderEnabled,
    reminderBeforeDays: createdDoc.reminderBeforeDays,
    reminderAfterDays: createdDoc.reminderAfterDays,
    recurringEmailEnabled: createdDoc.recurringEmailEnabled,
    recurringDayOfMonth: createdDoc.recurringDayOfMonth,
    lastRecurringQueuedOn: createdDoc.lastRecurringQueuedOn,
  });

  return NextResponse.json({ document: createdDoc });
}

export async function DELETE() {
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

  const deleted = await admin
    .from('billing_documents')
    .delete()
    .in('user_id', ownerIds)
    .select('id');

  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 400 });
  }

  const deletedCount = Array.isArray(deleted.data) ? deleted.data.length : 0;
  return NextResponse.json({ deletedCount });
}
