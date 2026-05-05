export type SlipExtractedFields = {
  reference?: string | null;
  amountThb?: number | null;
  receiverAccount?: string | null;
  payerAccount?: string | null;
  payerName?: string | null;
  transferredAt?: string | null;
  slipImageUrl?: string | null;
};

type ClientSlipOcrResult = {
  text: string;
  extracted: SlipExtractedFields;
};

const SLIP_UPLOAD_MAX_EDGE = 1920;
const SLIP_UPLOAD_JPEG_QUALITY = 0.86;
const SLIP_UPLOAD_MIN_SAVING_RATIO = 0.92;

function normalizeDigits(raw: unknown) {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function extractAmountCandidates(text: string) {
  const matches = text.match(/(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g) ?? [];
  return matches
    .map((token) => Number(token.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0 && value <= 1_000_000);
}

function pickAmountClosest(values: number[], expected?: number | null) {
  if (!values.length) return null;
  if (!Number.isFinite(Number(expected ?? Number.NaN))) return values[0] ?? null;

  let best = values[0] ?? null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const diff = Math.abs(value - Number(expected));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = value;
    }
  }
  return best;
}

function extractAccountCandidates(text: string) {
  const rawMatches = text.match(/(?:\d[\s-]?){8,16}/g) ?? [];
  const values = new Set<string>();
  for (const token of rawMatches) {
    const digits = normalizeDigits(token);
    if (digits.length < 8 || digits.length > 16) continue;
    values.add(digits);
  }
  return [...values];
}

function extractReference(text: string) {
  const patterns = [
    /(?:ref(?:erence)?|เลขอ้างอิง|รหัสอ้างอิง|transaction id|txid)[:\s#-]*([a-z0-9-]{6,40})/i,
    /\b([a-z0-9]{10,40})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function normalizeDateTimeParts(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}) {
  let year = parts.year;
  if (year >= 2500) year -= 543;
  if (year < 100) year += 2000;
  const month = parts.month;
  const day = parts.day;
  const hour = parts.hour;
  const minute = parts.minute;
  const second = parts.second ?? 0;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+07:00`;
  return Number.isFinite(new Date(iso).getTime()) ? iso : null;
}

function extractTransferredAtFromText(text: string) {
  const patterns: RegExp[] = [
    /(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})[^\d]{0,8}(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/g,
    /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})[^\d]{0,8}(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/g,
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (!match[1] || !match[2] || !match[3] || !match[4] || !match[5]) continue;
      const a = Number(match[1]);
      const b = Number(match[2]);
      const c = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = match[6] ? Number(match[6]) : 0;
      if (pattern === patterns[0]) {
        const direct = normalizeDateTimeParts({ year: a, month: b, day: c, hour, minute, second });
        if (direct) return direct;
      } else {
        const swapped = normalizeDateTimeParts({ year: c, month: b, day: a, hour, minute, second });
        if (swapped) return swapped;
      }
    }
  }
  return null;
}

export function hasMeaningfulSlipFields(fields: SlipExtractedFields) {
  return Boolean(
    (fields.reference && fields.reference.length > 0) ||
      (typeof fields.amountThb === "number" && Number.isFinite(fields.amountThb)) ||
      (fields.receiverAccount && fields.receiverAccount.length >= 4) ||
      (fields.payerAccount && fields.payerAccount.length >= 4) ||
      (fields.payerName && fields.payerName.length > 1) ||
      (fields.transferredAt && fields.transferredAt.length > 0),
  );
}

export async function extractSlipFieldsFromImageClient(input: {
  file: File;
  expectedAmountThb?: number | null;
  onProgress?: (progress: number) => void;
}): Promise<ClientSlipOcrResult> {
  const { recognizeImageWithOcr } = await import("@/lib/ocr-worker");
  const text = await recognizeImageWithOcr({
    file: input.file,
    language: "tha+eng",
    onProgress: (value) => {
      const normalized = clamp(Number(value ?? 0), 0, 1);
      input.onProgress?.(normalized);
    },
  });
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  const amounts = extractAmountCandidates(normalized);
  const amountThb = pickAmountClosest(amounts, input.expectedAmountThb ?? null);
  const accounts = extractAccountCandidates(normalized);
  const reference = extractReference(normalized);
  const transferredAt = extractTransferredAtFromText(normalized);

  const extracted: SlipExtractedFields = {
    reference: reference ?? null,
    amountThb: amountThb ?? null,
    receiverAccount: accounts[0] ?? null,
    payerAccount: accounts[1] ?? null,
    payerName: null,
    transferredAt: transferredAt ?? null,
  };

  return {
    text: normalized,
    extracted,
  };
}

export function toDatetimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function toIsoFromDatetimeLocal(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function optimizeSlipImageForUpload(file: File) {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const width = Number(bitmap.width);
    const height = Number(bitmap.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return file;

    const scale = Math.min(1, SLIP_UPLOAD_MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.max(64, Math.round(width * scale));
    const targetHeight = Math.max(64, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", SLIP_UPLOAD_JPEG_QUALITY);
    });
    if (!blob || blob.size <= 0) return file;

    const largeEnoughSaving = blob.size < file.size * SLIP_UPLOAD_MIN_SAVING_RATIO;
    const resized = targetWidth !== width || targetHeight !== height;
    if (!largeEnoughSaving && !resized) return file;

    const baseName = file.name.replace(/\.[a-z0-9]+$/i, "");
    return new File([blob], `${baseName || "slip-image"}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}
