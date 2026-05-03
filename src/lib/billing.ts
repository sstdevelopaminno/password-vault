export type BillingDocKind = 'receipt' | 'invoice';
export type BillingTemplate = 'a4' | '80mm';

export type BillingLine = {
  description: string;
  qty: number;
  unitPrice: number;
};

export type BillingTotals = {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  vatAmount: number;
  grandTotal: number;
};

export type BillingDocumentView = {
  id: string;
  shareToken: string;
  userId: string;
  docKind: BillingDocKind;
  template: BillingTemplate;
  documentNo: string;
  referenceNo: string;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  sellerAddress: string;
  sellerTaxId: string;
  buyerName: string;
  buyerAddress: string;
  buyerTaxId: string;
  contactName: string;
  contactPhone: string;
  paymentMethod: string;
  noteMessage: string;
  discountPercent: number;
  vatPercent: number;
  currency: string;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  grandTotal: number;
  lines: BillingLine[];
  emailTo: string;
  emailMessage: string;
  createdAt: string;
  updatedAt: string;
};

function clampNumber(input: unknown, min = 0, max = 999999999) {
  const value = Number(input);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeText(input: unknown, maxLength = 500) {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizeDateInput(input: unknown) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

export function normalizeBillingLines(input: unknown) {
  if (!Array.isArray(input)) return [] as BillingLine[];
  const lines: BillingLine[] = [];
  for (const row of input) {
    const source = row as Partial<BillingLine> | null;
    const description = normalizeText(source?.description ?? '', 240);
    const qty = clampNumber(source?.qty ?? 0, 0, 1000000);
    const unitPrice = clampNumber(source?.unitPrice ?? 0, 0, 1000000000);
    if (!description) continue;
    lines.push({
      description,
      qty,
      unitPrice,
    });
  }
  return lines.slice(0, 200);
}

export function computeBillingTotals(lines: BillingLine[], discountPercent: number, vatPercent: number): BillingTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const discountAmount = subtotal * clampNumber(discountPercent, 0, 100) / 100;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatAmount = afterDiscount * clampNumber(vatPercent, 0, 100) / 100;
  const grandTotal = afterDiscount + vatAmount;

  return {
    subtotal,
    discountAmount,
    afterDiscount,
    vatAmount,
    grandTotal,
  };
}

export function safeCurrencyNumber(input: unknown) {
  return clampNumber(input, 0, 1000000000000);
}

export function formatCurrency(value: number, locale = 'th-TH') {
  return safeCurrencyNumber(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: string | null, locale: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function lineTotal(line: BillingLine) {
  return safeCurrencyNumber(line.qty) * safeCurrencyNumber(line.unitPrice);
}

function buildA4Html(doc: BillingDocumentView, locale: string) {
  return [
    '<article class="sheet sheet-a4">',
    '<div class="head-grid">',
    '<section>',
    '<h1 class="seller">' + escapeHtml(doc.sellerName || 'Seller') + '</h1>',
    '<p class="muted">Phone: ' + escapeHtml(doc.sellerTaxId || '-') + '</p>',
    '</section>',
    '<section class="doc-box">',
    '<div class="doc-kind">' + (doc.docKind === 'receipt' ? 'Receipt' : 'Invoice') + '</div>',
    '<div>Bill No: ' + escapeHtml(doc.documentNo || '-') + '</div>',
    '<div>Date: ' + escapeHtml(formatDate(doc.issueDate, locale)) + '</div>',
    '</section>',
    '</div>',
    '<div class="party-grid">',
    '<section>',
    '<div class="label">Client</div>',
    '<div class="value">' + escapeHtml(doc.buyerName || '-') + '</div>',
    '<div class="muted">Phone: ' + escapeHtml(doc.contactPhone || '-') + '</div>',
    '</section>',
    '<section>',
    '<div class="label">Seller</div>',
    '<div class="value">' + escapeHtml(doc.sellerName || '-') + '</div>',
    '<div class="muted">Phone: ' + escapeHtml(doc.sellerTaxId || '-') + '</div>',
    '</section>',
    '</div>',
    '<table class="items">',
    '<thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr></thead>',
    '<tbody>',
    ...doc.lines.map((line, index) =>
      '<tr>' +
      '<td>' + String(index + 1) + '</td>' +
      '<td>' + escapeHtml(line.description) + '</td>' +
      '<td class="r">' + escapeHtml(String(line.qty)) + '</td>' +
      '<td class="r">' + escapeHtml(formatCurrency(line.unitPrice, locale)) + '</td>' +
      '<td class="r">' + escapeHtml(formatCurrency(lineTotal(line), locale)) + '</td>' +
      '</tr>',
    ),
    '</tbody>',
    '</table>',
    '<section class="totals">',
    '<div><span>Total</span><span>' + escapeHtml(formatCurrency(doc.subtotal, locale)) + ' ' + escapeHtml(doc.currency) + '</span></div>',
    '<div><span>VAT ' + escapeHtml(String(doc.vatPercent)) + '%</span><span>' + escapeHtml(formatCurrency(doc.vatAmount, locale)) + ' ' + escapeHtml(doc.currency) + '</span></div>',
    '<div class="grand"><span>Net Payment</span><span>' + escapeHtml(formatCurrency(doc.grandTotal, locale)) + ' ' + escapeHtml(doc.currency) + '</span></div>',
    '</section>',
    '</article>',
  ].join('');
}

function buildThermalHtml(doc: BillingDocumentView, locale: string) {
  return [
    '<article class="sheet sheet-80">',
    '<div class="center strong">' + escapeHtml(doc.sellerName || 'ร้านของฉัน') + '</div>',
    '<div class="center">' + escapeHtml(doc.sellerTaxId || '-') + '</div>',
    '<div class="center strong">' + (doc.docKind === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้') + '</div>',
    '<hr />',
    '<div>รหัสออกบิล: ' + escapeHtml(doc.documentNo || '-') + '</div>',
    '<div>วันที่: ' + escapeHtml(formatDate(doc.issueDate, locale)) + '</div>',
    '<div>ลูกค้า: ' + escapeHtml(doc.buyerName || '-') + '</div>',
    '<div>โทร: ' + escapeHtml(doc.contactPhone || '-') + '</div>',
    '<hr />',
    '<table class="items80"><thead><tr><th>รายการ</th><th class="r">ราคา</th><th class="r">Qty</th><th class="r">รวม</th></tr></thead><tbody>',
    ...doc.lines.map((line) =>
      '<tr>' +
      '<td>' + escapeHtml(line.description) + '</td>' +
      '<td class="r">' + escapeHtml(formatCurrency(line.unitPrice, locale)) + '</td>' +
      '<td class="r">' + escapeHtml(String(line.qty)) + '</td>' +
      '<td class="r">' + escapeHtml(formatCurrency(lineTotal(line), locale)) + '</td>' +
      '</tr>',
    ),
    '</tbody></table>',
    '<hr />',
    '<div class="r">ยอดรวม: ' + escapeHtml(formatCurrency(doc.subtotal, locale)) + '</div>',
    '<div class="r">VAT ' + escapeHtml(String(doc.vatPercent)) + '%: ' + escapeHtml(formatCurrency(doc.vatAmount, locale)) + '</div>',
    '<div class="r strong">ยอดชำระสุทธิ์: ' + escapeHtml(formatCurrency(doc.grandTotal, locale)) + ' บาท</div>',
    '<hr />',
    '<div class="center">*** ขอบคุณที่ใช้บริการ ***</div>',
    '</article>',
  ].join('');
}

export function buildBillingExportHtml(input: {
  document: BillingDocumentView;
  template: BillingTemplate;
  locale?: string;
  print?: boolean;
}) {
  const locale = input.locale || 'th-TH';
  const body = input.template === '80mm'
    ? buildThermalHtml(input.document, locale)
    : buildA4Html(input.document, locale);

  const pageCss = input.template === '80mm'
    ? '@page { size: 80mm auto; margin: 4mm; }'
    : '@page { size: A4; margin: 12mm; }';

  return [
    '<!doctype html>',
    '<html lang="' + (locale.startsWith('th') ? 'th' : 'en') + '">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>' + escapeHtml(input.document.documentNo || 'billing-document') + '</title>',
    '<style>',
    pageCss,
    'body { margin: 0; padding: 14px; background: #f1f5f9; color: #0f172a; font-family: "Segoe UI","Noto Sans Thai",sans-serif; }',
    '.toolbar { margin: 0 auto 12px; max-width: 820px; display: flex; justify-content: flex-end; gap: 8px; }',
    '.btn { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 10px; padding: 8px 12px; font-weight: 600; cursor: pointer; }',
    '.sheet { margin: 0 auto; background: #fff; border: 1px solid #dbe2ea; border-radius: 12px; }',
    '.sheet-a4 { max-width: 780px; padding: 18px; }',
    '.head-grid { display: grid; gap: 14px; grid-template-columns: 1fr 320px; }',
    '.seller { margin: 0; font-size: 22px; line-height: 1.2; }',
    '.doc-box { border: 1px solid #dbe2ea; background: #f8fafc; border-radius: 10px; padding: 10px; font-size: 12px; line-height: 1.6; }',
    '.doc-kind { font-size: 20px; font-weight: 700; color: #0f766e; margin-bottom: 4px; }',
    '.party-grid { margin-top: 14px; display: grid; gap: 14px; grid-template-columns: 1fr 1fr; font-size: 13px; }',
    '.label { font-weight: 700; margin-bottom: 4px; }',
    '.value { font-size: 15px; font-weight: 600; }',
    '.muted { color: #475569; }',
    '.items { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }',
    '.items th, .items td { border-bottom: 1px solid #e2e8f0; padding: 7px 6px; text-align: left; vertical-align: top; }',
    '.items thead th { border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; background: #f8fafc; }',
    '.r { text-align: right !important; }',
    '.totals { margin-top: 14px; margin-left: auto; max-width: 300px; font-size: 12px; }',
    '.totals > div { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; }',
    '.totals .grand { border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 8px; font-size: 14px; font-weight: 700; }',
    '.footer-note { margin-top: 14px; color: #475569; font-size: 12px; line-height: 1.6; }',
    '.sheet-80 { max-width: 320px; padding: 10px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.4; }',
    '.items80 { width: 100%; border-collapse: collapse; margin-top: 6px; }',
    '.items80 th, .items80 td { padding: 2px 1px; border: 0; vertical-align: top; }',
    '.center { text-align: center; }',
    '.strong { font-weight: 700; }',
    'hr { border: 0; border-top: 1px dashed #64748b; margin: 8px 0; }',
    '@media print {',
    '  body { background: #fff; padding: 0; }',
    '  .toolbar { display: none; }',
    '  .sheet { border: 0; border-radius: 0; }',
    '  .sheet-a4 { padding: 0; max-width: none; }',
    '}',
    '@media (max-width: 780px) { .head-grid, .party-grid { grid-template-columns: 1fr; } }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="toolbar">',
    '<button class="btn" onclick="printOrDownloadPdf()">พิมพ์ / บันทึก PDF</button>',
    '</div>',
    body,
    '<script>',
    'function buildPdfUrl(){',
    '  try {',
    '    var url = new URL(window.location.href);',
    "    url.searchParams.set('format', 'pdf');",
    "    url.searchParams.delete('print');",
    '    return url.toString();',
    '  } catch (error) {',
    "    return window.location.pathname + window.location.search + (window.location.search ? '&' : '?') + 'format=pdf';",
    '  }',
    '}',
    'function openPdfFallback(){',
    '  var pdfUrl = buildPdfUrl();',
    '  try {',
    "    var opened = window.open(pdfUrl, '_blank', 'noopener,noreferrer');",
    '    if (opened) return;',
    '  } catch (error) {}',
    '  window.location.href = pdfUrl;',
    '}',
    'function isLikelyMobileDevice(){',
    '  var ua = "";',
    '  try { ua = String((navigator && navigator.userAgent) || ""); } catch (error) {}',
    '  var mobileUa = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(ua);',
    '  var coarsePointer = false;',
    '  var narrowViewport = false;',
    '  try {',
    '    if (typeof window.matchMedia === "function") {',
    '      coarsePointer = window.matchMedia("(pointer: coarse)").matches;',
    '      narrowViewport = window.matchMedia("(max-width: 900px)").matches;',
    '    }',
    '  } catch (error) {}',
    '  return mobileUa || (coarsePointer && narrowViewport);',
    '}',
    'function printOrDownloadPdf(){',
    '  if (isLikelyMobileDevice()) {',
    '    openPdfFallback();',
    '    return;',
    '  }',
    '  try {',
    "    if (typeof window.print === 'function') {",
    '      window.print();',
    '      return;',
    '    }',
    '  } catch (error) {}',
    '  openPdfFallback();',
    '}',
    '</script>',
    input.print ? '<script>setTimeout(function(){ printOrDownloadPdf(); }, 180);</script>' : '',
    '</body>',
    '</html>',
  ].join('');
}
