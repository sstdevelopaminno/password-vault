type BillingEmailInput = {
  toEmail: string;
  customerName: string;
  billType: 'receipt' | 'invoice';
  documentNo: string;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  grandTotal: number;
  currency: string;
  customMessage: string;
  a4ExportUrl: string;
  thermalExportUrl: string;
  attachments?: Array<{
    filename: string;
    contentBase64: string;
    contentType?: string;
  }>;
};

export type BillingEmailSendResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

function unwrapQuoted(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return '';
  return unwrapQuoted(raw);
}

function shouldSendBillingEmail() {
  const raw = getEnv('BILLING_EMAIL_ENABLED').toLowerCase();
  if (!raw) return true;
  return !['0', 'false', 'off', 'disabled', 'no'].includes(raw);
}

function getBillingResendApiKey() {
  return (
    getEnv('BILLING_EMAIL_RESEND_API_KEY') ||
    getEnv('NOTE_REMINDER_RESEND_API_KEY') ||
    getEnv('RESEND_API_KEY') ||
    getEnv('OTP_RESEND_API_KEY')
  );
}

function isResendKeyFormat(value: string) {
  return /^re_[a-z0-9]+$/i.test(value.trim());
}

function mapEmailProviderError(errorBody: string) {
  const text = String(errorBody || '').trim();
  if (!text) return 'Unable to send billing email';
  const lower = text.toLowerCase();
  if (lower.includes('api key is invalid')) {
    return 'Billing email API key is invalid. Please set BILLING_EMAIL_RESEND_API_KEY with a valid Resend key.';
  }
  return text;
}

function getBillingFromAddress() {
  return (
    getEnv('BILLING_EMAIL_FROM') ||
    getEnv('NOTE_REMINDER_EMAIL_FROM') ||
    getEnv('OTP_EMAIL_FROM') ||
    'Vault Billing <no-reply@password-vault.local>'
  );
}

function getReplyTo() {
  return getEnv('BILLING_EMAIL_REPLY_TO');
}

function sanitizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

function formatCurrency(value: number, locale = 'th-TH') {
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function sendBillingDocumentEmail(input: BillingEmailInput): Promise<BillingEmailSendResult> {
  if (!shouldSendBillingEmail()) {
    return { ok: false, skipped: true, error: 'Billing email disabled' };
  }

  const apiKey = getBillingResendApiKey();
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'Billing email API key is missing' };
  }
  if (!isResendKeyFormat(apiKey)) {
    return {
      ok: false,
      skipped: true,
      error: 'Billing email API key format is invalid. Expected Resend key format (re_...).',
    };
  }

  const subjectPrefix = getEnv('BILLING_EMAIL_SUBJECT_PREFIX') || 'เอกสารจากระบบ';
  const billTypeLabelTh = input.billType === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้';
  const billTypeLabelEn = input.billType === 'receipt' ? 'Receipt' : 'Invoice';
  const customerName = sanitizeText(input.customerName || '');
  const customMessage = sanitizeText(input.customMessage || '');
  const safeSellerName = sanitizeText(input.sellerName || 'Vault Billing');
  const dueText = input.dueDate ? input.dueDate : '-';
  const amountText = formatCurrency(input.grandTotal) + ' ' + (input.currency || 'THB');

  const subject = `${subjectPrefix}: ${billTypeLabelTh}/${billTypeLabelEn} #${input.documentNo}`;
  const text = [
    `${safeSellerName}`,
    '',
    `${billTypeLabelTh} / ${billTypeLabelEn}`,
    `Document No: ${input.documentNo}`,
    `Issue Date: ${input.issueDate}`,
    `Due Date: ${dueText}`,
    `Grand Total: ${amountText}`,
    customerName ? `Customer: ${customerName}` : '',
    customMessage ? `Message: ${customMessage}` : '',
    '',
    input.a4ExportUrl ? `A4: ${input.a4ExportUrl}` : '',
    input.thermalExportUrl ? `80mm: ${input.thermalExportUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = [
    '<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a">',
    `<h2 style="margin:0 0 10px">${safeSellerName}</h2>`,
    `<p style="margin:0 0 8px"><strong>${billTypeLabelTh}</strong> / ${billTypeLabelEn}</p>`,
    `<p style="margin:0 0 4px"><strong>Document No:</strong> ${input.documentNo}</p>`,
    `<p style="margin:0 0 4px"><strong>Issue Date:</strong> ${input.issueDate}</p>`,
    `<p style="margin:0 0 4px"><strong>Due Date:</strong> ${dueText}</p>`,
    `<p style="margin:0 0 10px"><strong>Grand Total:</strong> ${amountText}</p>`,
    customerName ? `<p style="margin:0 0 8px"><strong>Customer:</strong> ${customerName}</p>` : '',
    customMessage ? `<p style="margin:0 0 10px"><strong>Message:</strong> ${customMessage}</p>` : '',
    '<div style="margin-top:14px">',
    input.a4ExportUrl
      ? `<a href="${input.a4ExportUrl}" style="display:inline-block;margin-right:8px;background:#1d4ed8;color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px">เปิดเอกสาร A4</a>`
      : '',
    input.thermalExportUrl
      ? `<a href="${input.thermalExportUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px">เปิดเอกสาร 80mm</a>`
      : '',
    '</div>',
    '<p style="margin:14px 0 0;color:#64748b;font-size:12px">เอกสารนี้สามารถกดพิมพ์และบันทึกเป็น PDF ได้ทันที</p>',
    '</div>',
  ]
    .filter(Boolean)
    .join('');

  const replyTo = getReplyTo();
  const body: Record<string, unknown> = {
    from: getBillingFromAddress(),
    to: [input.toEmail],
    subject,
    text,
    html,
  };
  if (Array.isArray(input.attachments) && input.attachments.length > 0) {
    body.attachments = input.attachments
      .filter((attachment) => attachment.filename && attachment.contentBase64)
      .map((attachment) => ({
        filename: attachment.filename,
        content: attachment.contentBase64,
        type: attachment.contentType || 'application/pdf',
      }));
  }
  if (replyTo) {
    body.reply_to = replyTo;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.text().catch(() => '')) || `Resend API error: ${response.status}`;
    return { ok: false, error: mapEmailProviderError(errorBody) };
  }

  return { ok: true };
}
