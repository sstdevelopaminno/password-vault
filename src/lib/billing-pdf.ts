import fs from 'node:fs';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { type BillingDocumentView, formatCurrency } from '@/lib/billing';

const TH_FONT_PATH = path.join(process.cwd(), 'src', 'assets', 'fonts', 'THSarabun.ttf');
const TH_FONT_BOLD_PATH = path.join(process.cwd(), 'src', 'assets', 'fonts', 'THSarabun-Bold.ttf');

let cachedRegularFontBytes: Uint8Array | null = null;
let cachedBoldFontBytes: Uint8Array | null = null;

function readFontBytes(filePath: string, cache: Uint8Array | null) {
  if (cache) return cache;
  const bytes = fs.readFileSync(filePath);
  return new Uint8Array(bytes);
}

function normalizeText(input: string) {
  return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string | null, locale = 'th-TH') {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function textWidth(font: PDFFont, text: string, size: number) {
  return font.widthOfTextAtSize(text, size);
}

function drawTextLeft(page: PDFPage, input: { x: number; y: number; text: string; size: number; font: PDFFont; color?: ReturnType<typeof rgb> }) {
  page.drawText(input.text, {
    x: input.x,
    y: input.y,
    size: input.size,
    font: input.font,
    color: input.color ?? rgb(0.1, 0.15, 0.22),
  });
}

function drawTextRight(page: PDFPage, input: { rightX: number; y: number; text: string; size: number; font: PDFFont; color?: ReturnType<typeof rgb> }) {
  const width = textWidth(input.font, input.text, input.size);
  drawTextLeft(page, {
    x: input.rightX - width,
    y: input.y,
    text: input.text,
    size: input.size,
    font: input.font,
    color: input.color,
  });
}

function drawTextCenter(page: PDFPage, input: { centerX: number; y: number; text: string; size: number; font: PDFFont; color?: ReturnType<typeof rgb> }) {
  const width = textWidth(input.font, input.text, input.size);
  drawTextLeft(page, {
    x: input.centerX - width / 2,
    y: input.y,
    text: input.text,
    size: input.size,
    font: input.font,
    color: input.color,
  });
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const normalized = normalizeText(text || '');
  if (!normalized) return ['-'];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(font, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }

    if (textWidth(font, word, size) <= maxWidth) {
      current = word;
      continue;
    }

    let part = '';
    for (const ch of word) {
      const test = part + ch;
      if (textWidth(font, test, size) <= maxWidth) {
        part = test;
      } else {
        if (part) lines.push(part);
        part = ch;
      }
    }
    current = part;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['-'];
}

function yFromTop(pageHeight: number, top: number) {
  return pageHeight - top;
}

function drawA4Document(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, document: BillingDocumentView, locale: string) {
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 34;
  const contentWidth = pageWidth - margin * 2;
  const rightBoxW = 218;
  const rightBoxX = pageWidth - margin - rightBoxW;

  page.drawRectangle({
    x: margin,
    y: yFromTop(pageHeight, 50 + 76),
    width: 76,
    height: 76,
    borderColor: rgb(0.82, 0.86, 0.9),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });
  drawTextCenter(page, { centerX: margin + 38, y: yFromTop(pageHeight, 90), text: 'LOGO', size: 13, font: fonts.bold });

  const x1 = pageWidth - margin - 58;
  const y1 = yFromTop(pageHeight, margin);
  const x2 = pageWidth - margin;
  const y2 = yFromTop(pageHeight, margin);
  const x3 = pageWidth - margin;
  const y3 = yFromTop(pageHeight, margin + 58);
  page.drawSvgPath(`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} Z`, {
    borderColor: rgb(0.35, 0.67, 0.35),
    borderWidth: 0.5,
    color: rgb(0.46, 0.74, 0.36),
  });
  drawTextCenter(page, {
    centerX: pageWidth - margin - 16,
    y: yFromTop(pageHeight, margin + 19),
    text: '2',
    size: 10,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 148), text: document.sellerName || 'ผู้ขาย', size: 24, font: fonts.bold });
  const sellerAddressLines = wrapText(fonts.regular, document.sellerAddress || '-', 14, 300).slice(0, 2);
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 171), text: sellerAddressLines[0], size: 14, font: fonts.regular, color: rgb(0.28, 0.33, 0.39) });
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 187), text: sellerAddressLines[1] || '', size: 14, font: fonts.regular, color: rgb(0.28, 0.33, 0.39) });
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 203), text: 'Tax ID: ' + (document.sellerTaxId || '-'), size: 13, font: fonts.regular, color: rgb(0.3, 0.35, 0.42) });

  page.drawRectangle({
    x: rightBoxX,
    y: yFromTop(pageHeight, 52 + 122),
    width: rightBoxW,
    height: 122,
    borderColor: rgb(0.82, 0.86, 0.9),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });
  drawTextLeft(page, {
    x: rightBoxX + 12,
    y: yFromTop(pageHeight, 74),
    text: document.docKind === 'receipt' ? 'ใบเสร็จ / Receipt' : 'ใบแจ้งหนี้ / Invoice',
    size: 18,
    font: fonts.bold,
    color: rgb(0.22, 0.56, 0.24),
  });
  drawTextLeft(page, { x: rightBoxX + 12, y: yFromTop(pageHeight, 95), text: 'Document No: ' + (document.documentNo || '-'), size: 12, font: fonts.regular });
  drawTextLeft(page, { x: rightBoxX + 12, y: yFromTop(pageHeight, 109), text: 'Date: ' + formatDate(document.issueDate, locale), size: 12, font: fonts.regular });
  drawTextLeft(page, { x: rightBoxX + 12, y: yFromTop(pageHeight, 123), text: 'Reference: ' + (document.referenceNo || '-'), size: 12, font: fonts.regular });
  drawTextLeft(page, { x: rightBoxX + 12, y: yFromTop(pageHeight, 137), text: 'Due Date: ' + formatDate(document.dueDate, locale), size: 12, font: fonts.regular });
  drawTextLeft(page, { x: rightBoxX + 12, y: yFromTop(pageHeight, 151), text: 'Contact: ' + (document.contactName || '-'), size: 12, font: fonts.regular });
  drawTextLeft(page, { x: rightBoxX + 12, y: yFromTop(pageHeight, 165), text: 'Phone: ' + (document.contactPhone || '-'), size: 12, font: fonts.regular });

  page.drawLine({
    start: { x: margin, y: yFromTop(pageHeight, 218) },
    end: { x: pageWidth - margin, y: yFromTop(pageHeight, 218) },
    thickness: 1,
    color: rgb(0.83, 0.87, 0.91),
  });
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 236), text: locale.startsWith('th') ? 'ลูกค้า' : 'Client', size: 14, font: fonts.bold, color: rgb(0.39, 0.53, 0.23) });
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 252), text: document.buyerName || '-', size: 14, font: fonts.bold });
  const buyerLines = wrapText(fonts.regular, document.buyerAddress || '-', 12, 320).slice(0, 2);
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 268), text: buyerLines[0], size: 12, font: fonts.regular });
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 282), text: buyerLines[1] || '', size: 12, font: fonts.regular });
  drawTextLeft(page, { x: margin, y: yFromTop(pageHeight, 296), text: 'Tax ID: ' + (document.buyerTaxId || '-'), size: 12, font: fonts.regular });

  const tableTop = 314;
  const tableHeight = 328;
  const headerH = 24;
  const col = [30, 274, 58, 82, 83];
  const rowH = 18;

  page.drawRectangle({
    x: margin,
    y: yFromTop(pageHeight, tableTop + tableHeight),
    width: contentWidth,
    height: tableHeight,
    borderWidth: 1,
    borderColor: rgb(0.76, 0.8, 0.86),
  });
  page.drawRectangle({
    x: margin,
    y: yFromTop(pageHeight, tableTop + headerH),
    width: contentWidth,
    height: headerH,
    color: rgb(0.96, 0.97, 0.99),
    borderWidth: 1,
    borderColor: rgb(0.76, 0.8, 0.86),
  });

  let cx = margin;
  for (let i = 0; i < col.length - 1; i += 1) {
    cx += col[i];
    page.drawLine({
      start: { x: cx, y: yFromTop(pageHeight, tableTop) },
      end: { x: cx, y: yFromTop(pageHeight, tableTop + tableHeight) },
      thickness: 1,
      color: rgb(0.83, 0.87, 0.91),
    });
  }

  drawTextLeft(page, { x: margin + 8, y: yFromTop(pageHeight, tableTop + 16), text: '#', size: 11, font: fonts.bold });
  drawTextLeft(page, { x: margin + 34, y: yFromTop(pageHeight, tableTop + 16), text: locale.startsWith('th') ? 'รายการ' : 'Description', size: 11, font: fonts.bold });
  drawTextLeft(page, { x: margin + 320, y: yFromTop(pageHeight, tableTop + 16), text: 'Qty', size: 11, font: fonts.bold });
  drawTextLeft(page, { x: margin + 380, y: yFromTop(pageHeight, tableTop + 16), text: locale.startsWith('th') ? 'ราคา' : 'Unit Price', size: 11, font: fonts.bold });
  drawTextLeft(page, { x: margin + 463, y: yFromTop(pageHeight, tableTop + 16), text: locale.startsWith('th') ? 'รวม' : 'Total', size: 11, font: fonts.bold });

  const maxRows = Math.min(16, Math.max(1, Math.floor((tableHeight - headerH - 8) / rowH)));
  for (let i = 0; i < maxRows; i += 1) {
    const y = tableTop + headerH + i * rowH;
    page.drawLine({
      start: { x: margin, y: yFromTop(pageHeight, y) },
      end: { x: margin + contentWidth, y: yFromTop(pageHeight, y) },
      thickness: 0.7,
      color: rgb(0.9, 0.92, 0.95),
    });
  }

  const rows = document.lines.slice(0, maxRows);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const y = tableTop + headerH + 13 + i * rowH;
    const total = row.qty * row.unitPrice;
    const desc = wrapText(fonts.regular, row.description, 11, 255)[0];
    drawTextLeft(page, { x: margin + 8, y: yFromTop(pageHeight, y), text: String(i + 1), size: 10, font: fonts.regular });
    drawTextLeft(page, { x: margin + 34, y: yFromTop(pageHeight, y), text: desc, size: 10, font: fonts.regular });
    drawTextRight(page, { rightX: margin + 356, y: yFromTop(pageHeight, y), text: String(row.qty), size: 10, font: fonts.regular });
    drawTextRight(page, { rightX: margin + 438, y: yFromTop(pageHeight, y), text: formatCurrency(row.unitPrice, locale), size: 10, font: fonts.regular });
    drawTextRight(page, { rightX: margin + 521, y: yFromTop(pageHeight, y), text: formatCurrency(total, locale), size: 10, font: fonts.regular });
  }

  if (document.lines.length > rows.length) {
    drawTextLeft(page, {
      x: margin + 34,
      y: yFromTop(pageHeight, tableTop + headerH + rowH * maxRows + 14),
      text: locale.startsWith('th') ? `... อีก ${document.lines.length - rows.length} รายการ` : `... ${document.lines.length - rows.length} more items`,
      size: 10,
      font: fonts.bold,
      color: rgb(0.4, 0.45, 0.5),
    });
  }

  const totalsX = pageWidth - margin - 226;
  const totalsTop = tableTop + tableHeight + 16;
  page.drawRectangle({
    x: totalsX,
    y: yFromTop(pageHeight, totalsTop + 116),
    width: 226,
    height: 116,
    borderColor: rgb(0.78, 0.82, 0.88),
    borderWidth: 1,
  });
  drawTextLeft(page, { x: totalsX + 12, y: yFromTop(pageHeight, totalsTop + 21), text: locale.startsWith('th') ? 'ยอดรวม' : 'Subtotal', size: 12, font: fonts.regular });
  drawTextRight(page, { rightX: totalsX + 214, y: yFromTop(pageHeight, totalsTop + 21), text: formatCurrency(document.subtotal, locale), size: 12, font: fonts.bold });
  drawTextLeft(page, { x: totalsX + 12, y: yFromTop(pageHeight, totalsTop + 39), text: (locale.startsWith('th') ? 'ส่วนลด ' : 'Discount ') + String(document.discountPercent) + '%', size: 12, font: fonts.regular });
  drawTextRight(page, { rightX: totalsX + 214, y: yFromTop(pageHeight, totalsTop + 39), text: '-' + formatCurrency(document.discountAmount, locale), size: 12, font: fonts.bold });
  drawTextLeft(page, { x: totalsX + 12, y: yFromTop(pageHeight, totalsTop + 57), text: 'VAT ' + String(document.vatPercent) + '%', size: 12, font: fonts.regular });
  drawTextRight(page, { rightX: totalsX + 214, y: yFromTop(pageHeight, totalsTop + 57), text: formatCurrency(document.vatAmount, locale), size: 12, font: fonts.bold });
  page.drawLine({
    start: { x: totalsX + 10, y: yFromTop(pageHeight, totalsTop + 72) },
    end: { x: totalsX + 216, y: yFromTop(pageHeight, totalsTop + 72) },
    thickness: 1,
    color: rgb(0.72, 0.76, 0.82),
  });
  drawTextLeft(page, { x: totalsX + 12, y: yFromTop(pageHeight, totalsTop + 93), text: locale.startsWith('th') ? 'ยอดสุทธิ' : 'Grand Total', size: 14, font: fonts.bold });
  drawTextRight(page, { rightX: totalsX + 214, y: yFromTop(pageHeight, totalsTop + 93), text: formatCurrency(document.grandTotal, locale) + ' ' + (document.currency || 'THB'), size: 14, font: fonts.bold });

  drawTextLeft(page, {
    x: margin,
    y: yFromTop(pageHeight, totalsTop + 20),
    text: (locale.startsWith('th') ? 'ชำระโดย: ' : 'Payment: ') + (document.paymentMethod || '-'),
    size: 12,
    font: fonts.regular,
  });
  drawTextLeft(page, {
    x: margin,
    y: yFromTop(pageHeight, totalsTop + 38),
    text: (locale.startsWith('th') ? 'หมายเหตุ: ' : 'Note: ') + (document.noteMessage || '-'),
    size: 12,
    font: fonts.regular,
  });

  const sigTop = pageHeight - 92;
  page.drawLine({
    start: { x: margin, y: yFromTop(pageHeight, sigTop) },
    end: { x: pageWidth - margin, y: yFromTop(pageHeight, sigTop) },
    thickness: 1,
    color: rgb(0.82, 0.85, 0.89),
  });
  drawTextCenter(page, { centerX: margin + 92, y: yFromTop(pageHeight, sigTop + 20), text: locale.startsWith('th') ? 'ผู้ชำระเงิน' : 'Paid by', size: 11, font: fonts.regular });
  drawTextCenter(page, { centerX: margin + 256, y: yFromTop(pageHeight, sigTop + 20), text: locale.startsWith('th') ? 'วันที่' : 'Date', size: 11, font: fonts.regular });
  drawTextCenter(page, { centerX: pageWidth - margin - 184, y: yFromTop(pageHeight, sigTop + 20), text: locale.startsWith('th') ? 'ผู้รับเงิน' : 'Collected by', size: 11, font: fonts.regular });
  drawTextCenter(page, { centerX: pageWidth - margin - 52, y: yFromTop(pageHeight, sigTop + 20), text: locale.startsWith('th') ? 'วันที่' : 'Date', size: 11, font: fonts.regular });
}

function drawThermalDocument(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, document: BillingDocumentView, locale: string) {
  const width = page.getWidth();
  const height = page.getHeight();
  const left = 10;
  const right = width - 10;
  const priceX = 138;
  const qtyX = 164;
  const totalX = right;
  let top = 14;

  drawTextCenter(page, { centerX: width / 2, y: yFromTop(height, top), text: document.sellerName || (locale.startsWith('th') ? 'ร้านของฉัน' : 'My Store'), size: 16, font: fonts.bold });
  top += 16;
  drawTextCenter(page, { centerX: width / 2, y: yFromTop(height, top), text: document.contactPhone || '-', size: 11, font: fonts.regular });
  top += 14;
  drawTextCenter(page, {
    centerX: width / 2,
    y: yFromTop(height, top),
    text: document.docKind === 'receipt' ? (locale.startsWith('th') ? 'ใบเสร็จ' : 'Receipt') : (locale.startsWith('th') ? 'ใบแจ้งหนี้' : 'Invoice'),
    size: 14,
    font: fonts.bold,
  });
  top += 12;
  page.drawLine({ start: { x: left, y: yFromTop(height, top) }, end: { x: right, y: yFromTop(height, top) }, thickness: 1, color: rgb(0.58, 0.63, 0.69) });
  top += 11;

  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: (locale.startsWith('th') ? 'เลขที่: ' : 'No: ') + (document.documentNo || '-'), size: 10.5, font: fonts.regular });
  top += 11;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: (locale.startsWith('th') ? 'อ้างอิง: ' : 'Ref: ') + (document.referenceNo || '-'), size: 10.5, font: fonts.regular });
  top += 11;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: (locale.startsWith('th') ? 'วันที่: ' : 'Date: ') + formatDate(document.issueDate, locale), size: 10.5, font: fonts.regular });
  top += 11;
  if (document.docKind === 'invoice') {
    drawTextLeft(page, { x: left, y: yFromTop(height, top), text: (locale.startsWith('th') ? 'ครบกำหนด: ' : 'Due: ') + formatDate(document.dueDate, locale), size: 10.5, font: fonts.regular });
    top += 11;
  }
  const customerLine = (locale.startsWith('th') ? 'ลูกค้า: ' : 'Customer: ') + (document.buyerName || '-');
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: customerLine, size: 10.5, font: fonts.regular });
  top += 11;

  page.drawLine({ start: { x: left, y: yFromTop(height, top) }, end: { x: right, y: yFromTop(height, top) }, thickness: 1, color: rgb(0.58, 0.63, 0.69) });
  top += 9;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: locale.startsWith('th') ? 'รายการ' : 'Item', size: 10.5, font: fonts.bold });
  drawTextRight(page, { rightX: priceX, y: yFromTop(height, top), text: locale.startsWith('th') ? 'ราคา' : 'Price', size: 10.5, font: fonts.bold });
  drawTextRight(page, { rightX: qtyX, y: yFromTop(height, top), text: 'Qty', size: 10.5, font: fonts.bold });
  drawTextRight(page, { rightX: totalX, y: yFromTop(height, top), text: locale.startsWith('th') ? 'รวม' : 'Total', size: 10.5, font: fonts.bold });
  top += 8;
  page.drawLine({ start: { x: left, y: yFromTop(height, top) }, end: { x: right, y: yFromTop(height, top) }, thickness: 1, color: rgb(0.58, 0.63, 0.69) });
  top += 8;

  const maxRows = Math.min(document.lines.length, 48);
  for (let i = 0; i < maxRows; i += 1) {
    const row = document.lines[i];
    const total = row.qty * row.unitPrice;
    const wrapped = wrapText(fonts.regular, row.description || '-', 10, priceX - left - 6).slice(0, 2);
    drawTextLeft(page, { x: left, y: yFromTop(height, top), text: wrapped[0], size: 10, font: fonts.regular });
    drawTextRight(page, { rightX: priceX, y: yFromTop(height, top), text: formatCurrency(row.unitPrice, locale), size: 10, font: fonts.regular });
    drawTextRight(page, { rightX: qtyX, y: yFromTop(height, top), text: String(row.qty), size: 10, font: fonts.regular });
    drawTextRight(page, { rightX: totalX, y: yFromTop(height, top), text: formatCurrency(total, locale), size: 10, font: fonts.regular });
    top += 10;
    if (wrapped[1]) {
      drawTextLeft(page, { x: left, y: yFromTop(height, top), text: wrapped[1], size: 10, font: fonts.regular });
      top += 10;
    }
  }

  if (document.lines.length > maxRows) {
    drawTextLeft(page, {
      x: left,
      y: yFromTop(height, top),
      text: locale.startsWith('th') ? `... อีก ${document.lines.length - maxRows} รายการ` : `... ${document.lines.length - maxRows} more items`,
      size: 10,
      font: fonts.bold,
      color: rgb(0.4, 0.45, 0.5),
    });
    top += 11;
  }

  page.drawLine({ start: { x: left, y: yFromTop(height, top) }, end: { x: right, y: yFromTop(height, top) }, thickness: 1, color: rgb(0.58, 0.63, 0.69) });
  top += 11;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: locale.startsWith('th') ? 'ยอดรวม:' : 'Subtotal:', size: 11, font: fonts.regular });
  drawTextRight(page, { rightX: right, y: yFromTop(height, top), text: formatCurrency(document.subtotal, locale), size: 11, font: fonts.bold });
  top += 11;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: (locale.startsWith('th') ? 'ส่วนลด ' : 'Discount ') + String(document.discountPercent) + '%:', size: 11, font: fonts.regular });
  drawTextRight(page, { rightX: right, y: yFromTop(height, top), text: '-' + formatCurrency(document.discountAmount, locale), size: 11, font: fonts.bold });
  top += 11;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: 'VAT ' + String(document.vatPercent) + '%:', size: 11, font: fonts.regular });
  drawTextRight(page, { rightX: right, y: yFromTop(height, top), text: formatCurrency(document.vatAmount, locale), size: 11, font: fonts.bold });
  top += 10;
  page.drawLine({ start: { x: left, y: yFromTop(height, top) }, end: { x: right, y: yFromTop(height, top) }, thickness: 1, color: rgb(0.58, 0.63, 0.69) });
  top += 11;
  drawTextLeft(page, { x: left, y: yFromTop(height, top), text: locale.startsWith('th') ? 'ยอดสุทธิ:' : 'Grand Total:', size: 12.5, font: fonts.bold });
  drawTextRight(page, { rightX: right, y: yFromTop(height, top), text: formatCurrency(document.grandTotal, locale) + ' ' + (document.currency || 'THB'), size: 12.5, font: fonts.bold });
  top += 13;
  page.drawLine({ start: { x: left, y: yFromTop(height, top) }, end: { x: right, y: yFromTop(height, top) }, thickness: 1, color: rgb(0.58, 0.63, 0.69) });
  top += 11;
  drawTextCenter(page, {
    centerX: width / 2,
    y: yFromTop(height, top),
    text: (locale.startsWith('th') ? 'ชำระโดย: ' : 'Payment: ') + (document.paymentMethod || '-'),
    size: 11,
    font: fonts.regular,
  });
  top += 11;
  drawTextCenter(page, {
    centerX: width / 2,
    y: yFromTop(height, top),
    text: document.noteMessage || (locale.startsWith('th') ? '*** ขอบคุณที่ใช้บริการ ***' : '*** Thank you for your business ***'),
    size: 11,
    font: fonts.regular,
  });
}

async function createA4Pdf(document: BillingDocumentView, locale: string, fonts: { regular: PDFFont; bold: PDFFont }, pdfDoc: PDFDocument) {
  const page = pdfDoc.addPage([595.28, 841.89]);
  drawA4Document(page, fonts, document, locale);
}

async function createThermalPdf(document: BillingDocumentView, locale: string, fonts: { regular: PDFFont; bold: PDFFont }, pdfDoc: PDFDocument) {
  const lines = document.lines.length;
  const baseHeight = 420;
  const extraHeight = Math.max(0, lines - 10) * 16;
  const page = pdfDoc.addPage([226.77, baseHeight + extraHeight]);
  drawThermalDocument(page, fonts, document, locale);
}

export async function buildBillingPdfBuffer(input: { document: BillingDocumentView; template: 'a4' | '80mm'; locale?: string }) {
  cachedRegularFontBytes = readFontBytes(TH_FONT_PATH, cachedRegularFontBytes);
  cachedBoldFontBytes = readFontBytes(TH_FONT_BOLD_PATH, cachedBoldFontBytes);

  const locale = input.locale || 'th-TH';
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regular = await pdfDoc.embedFont(cachedRegularFontBytes, { subset: false });
  const bold = await pdfDoc.embedFont(cachedBoldFontBytes, { subset: false });
  const fonts = { regular, bold };

  if (input.template === '80mm') {
    await createThermalPdf(input.document, locale, fonts, pdfDoc);
  } else {
    await createA4Pdf(input.document, locale, fonts, pdfDoc);
  }

  const bytes = await pdfDoc.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
  return Buffer.from(bytes);
}
