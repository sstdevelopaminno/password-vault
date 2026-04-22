import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAccessibleUserIds } from '@/lib/user-identity';
import { buildBillingExportHtml, normalizeBillingLines, safeCurrencyNumber, type BillingDocumentView, type BillingTemplate } from '@/lib/billing';

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

function toClient(row: BillingDocumentRow): BillingDocumentView {
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

function safeFilename(input: string) {
  return input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'billing-document';
}

function pickTemplate(value: string | null, fallback: BillingTemplate): BillingTemplate {
  if (value === '80mm') return '80mm';
  if (value === 'a4') return 'a4';
  return fallback;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = String(searchParams.get('token') ?? '').trim();
  const locale = String(searchParams.get('locale') ?? 'th-TH');
  const print = searchParams.get('print') === '1';
  const admin = createAdminClient();

  let documentRow: BillingDocumentRow | null = null;
  if (token) {
    const byToken = await admin
      .from('billing_documents')
      .select('id,share_token,user_id,doc_kind,template,document_no,reference_no,issue_date,due_date,seller_name,seller_address,seller_tax_id,buyer_name,buyer_address,buyer_tax_id,contact_name,contact_phone,payment_method,note_message,discount_percent,vat_percent,currency,subtotal,discount_amount,vat_amount,grand_total,lines_json,email_to,email_message,created_at,updated_at')
      .eq('id', id)
      .eq('share_token', token)
      .maybeSingle();
    if (byToken.error) {
      return NextResponse.json({ error: byToken.error.message }, { status: 400 });
    }
    documentRow = (byToken.data ?? null) as BillingDocumentRow | null;
  } else {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    documentRow = (query.data ?? null) as BillingDocumentRow | null;
  }

  if (!documentRow) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const document = toClient(documentRow);
  const template = pickTemplate(searchParams.get('template'), document.template);
  const html = buildBillingExportHtml({
    document,
    template,
    locale,
    print,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="' + safeFilename(document.documentNo) + '-' + template + '.html"',
      'Cache-Control': 'no-store',
    },
  });
}
