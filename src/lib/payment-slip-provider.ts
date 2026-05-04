export type PackageSlipOrderSnapshot = {
  id: string;
  planId: string;
  cycle: "monthly" | "yearly";
  uniqueAmountThb: number;
  promptpayTarget: string;
};

export type PackageSlipSubmission = {
  slipImageUrl: string | null;
  rawPayload: unknown;
  reference: string | null;
  amountThb: number | null;
  receiverAccount: string | null;
  payerAccount: string | null;
  payerName: string | null;
  transferredAt: string | null;
};

export type PackageSlipProviderResult = {
  providerName: string;
  ok: boolean;
  providerVerified: boolean;
  reference: string | null;
  amountThb: number | null;
  receiverAccount: string | null;
  payerAccount: string | null;
  payerName: string | null;
  bankName: string | null;
  transferredAt: string | null;
  confidenceScore: number | null;
  suspicious: boolean | null;
  note: string | null;
  rawPayload: unknown;
};

type ThaiBankRule = {
  name: string;
  aliases: string[];
  appMarkers: string[];
};

const THAI_BANK_RULES: ThaiBankRule[] = [
  {
    name: "Bangkok Bank",
    aliases: ["bangkok bank", "bbl", "bualuang"],
    appMarkers: ["mobile banking", "bualuang m", "transaction success"],
  },
  {
    name: "Kasikornbank",
    aliases: ["kasikorn", "kbank", "k plus", "kplus"],
    appMarkers: ["k plus", "kplus", "transaction successful"],
  },
  {
    name: "Krungthai Bank",
    aliases: ["krungthai", "ktb", "krungthai next"],
    appMarkers: ["krungthai next", "transfer success", "transaction id"],
  },
  {
    name: "Siam Commercial Bank",
    aliases: ["siam commercial", "scb", "scb easy"],
    appMarkers: ["scb easy", "e-slip", "transaction successful"],
  },
  {
    name: "Krungsri",
    aliases: ["krungsri", "bay", "kma"],
    appMarkers: ["krungsri app", "kma", "e-slip"],
  },
  {
    name: "TTB",
    aliases: ["ttb", "tmb", "thanachart", "ttb touch"],
    appMarkers: ["ttb touch", "transaction", "transfer success"],
  },
  {
    name: "UOB",
    aliases: ["uob"],
    appMarkers: ["uob", "transaction details", "transfer successful"],
  },
  {
    name: "CIMB Thai",
    aliases: ["cimb", "cimb thai"],
    appMarkers: ["cimb thai", "transaction", "successful"],
  },
  {
    name: "Government Savings Bank",
    aliases: ["gsb", "government savings", "mymo"],
    appMarkers: ["mymo", "transaction", "successful"],
  },
  {
    name: "BAAC",
    aliases: ["baac", "a-mobile"],
    appMarkers: ["a-mobile", "transfer", "successful"],
  },
  {
    name: "PromptPay",
    aliases: ["promptpay"],
    appMarkers: ["promptpay", "reference", "transaction"],
  },
];

type OcrWordLike = {
  confidence?: number;
};

type OcrResultLike = {
  data?: {
    text?: string;
    words?: OcrWordLike[];
  };
};

type OcrWorkerLike = {
  recognize: (input: unknown) => Promise<OcrResultLike>;
  setParameters?: (params: Record<string, string | number>) => Promise<unknown>;
};

let internalOcrWorkerPromise: Promise<OcrWorkerLike> | null = null;

function toStringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type ExternalAdapterResponse = {
  ok?: boolean;
  providerVerified?: boolean;
  reference?: unknown;
  amountThb?: unknown;
  receiverAccount?: unknown;
  payerAccount?: unknown;
  payerName?: unknown;
  bankName?: unknown;
  transferredAt?: unknown;
  confidenceScore?: unknown;
  suspicious?: unknown;
  note?: unknown;
  rawPayload?: unknown;
};

function toBooleanOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return null;
}

function internalVerifierEnabled() {
  return String(process.env.PAYMENT_SLIP_INTERNAL_ENABLED ?? "1").trim() !== "0";
}

function normalizeDigits(raw: unknown) {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function accountLooksLikeMatch(actual: string, expected: string) {
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  if (actual.length >= 4 && expected.length >= 4) return actual.slice(-4) === expected.slice(-4);
  return false;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? iso : null;
}

function extractTransferredAtFromText(text: string) {
  const normalized = String(text ?? "");
  const patterns: RegExp[] = [
    /(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})[^\d]{0,8}(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/g,
    /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})[^\d]{0,8}(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/g,
  ];

  for (const pattern of patterns) {
    const matches = normalized.matchAll(pattern);
    for (const match of matches) {
      if (!match[1] || !match[2] || !match[3] || !match[4] || !match[5]) continue;
      const a = Number(match[1]);
      const b = Number(match[2]);
      const c = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = match[6] ? Number(match[6]) : 0;

      if (pattern === patterns[0]) {
        const direct = normalizeDateTimeParts({
          year: a,
          month: b,
          day: c,
          hour,
          minute,
          second,
        });
        if (direct) return direct;
      } else {
        const swapped = normalizeDateTimeParts({
          year: c,
          month: b,
          day: a,
          hour,
          minute,
          second,
        });
        if (swapped) return swapped;
      }
    }
  }

  return null;
}

function extractAmountCandidates(text: string) {
  const matches = text.match(/(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g) ?? [];
  const values = matches
    .map((token) => Number(token.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0 && value <= 1_000_000);
  return values;
}

function pickAmountClosest(values: number[], expected: number) {
  if (!values.length || !Number.isFinite(expected)) return null;
  let best: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const diff = Math.abs(value - expected);
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

function pickAccountCandidate(candidates: string[], expected: string) {
  if (!expected) return null;
  for (const candidate of candidates) {
    if (candidate === expected) return candidate;
  }
  for (const candidate of candidates) {
    if (candidate.length >= 4 && expected.length >= 4 && candidate.slice(-4) === expected.slice(-4)) return candidate;
  }
  return null;
}

function extractReferenceFromText(text: string) {
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

function detectBankContextFromText(text: string) {
  const normalized = text.toLowerCase();
  for (const bank of THAI_BANK_RULES) {
    for (const alias of bank.aliases) {
      if (!normalized.includes(alias.toLowerCase())) continue;
      const matchedMarker = bank.appMarkers.find((marker) => normalized.includes(marker.toLowerCase())) ?? null;
      return {
        bankName: bank.name,
        bankFormatMatched: matchedMarker !== null,
        matchedMarker,
      };
    }
  }
  return {
    bankName: null as string | null,
    bankFormatMatched: false,
    matchedMarker: null as string | null,
  };
}

function collectRawPayloadText(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") return "";
  const src = rawPayload as Record<string, unknown>;
  const fields = ["text", "ocr", "ocrText", "rawText", "message", "detail", "note"];
  const chunks: string[] = [];
  for (const field of fields) {
    const value = src[field];
    if (typeof value === "string" && value.trim().length > 0) chunks.push(value.trim());
  }
  if (!chunks.length) return "";
  return chunks.join("\n");
}

async function getInternalOcrWorker() {
  if (internalOcrWorkerPromise) return internalOcrWorkerPromise;
  internalOcrWorkerPromise = (async () => {
    const tesseract = (await import("tesseract.js")) as unknown as {
      createWorker: (lang?: string | string[], oem?: number) => Promise<OcrWorkerLike>;
    };
    const createWorker = tesseract.createWorker;
    const worker = await createWorker("tha+eng", 1);
    try {
      await worker.setParameters?.({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
    } catch {
      // ignore OCR parameter compatibility differences
    }
    return worker;
  })();
  return internalOcrWorkerPromise;
}

async function extractTextFromSlipImageUrl(url: string) {
  const timeoutMsRaw = Number(process.env.PAYMENT_SLIP_INTERNAL_FETCH_TIMEOUT_MS ?? 12000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.min(20_000, Math.max(2_000, Math.floor(timeoutMsRaw))) : 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { text: "", ocrConfidence: null as number | null, note: "slip_image_fetch_failed" };
    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("image")) {
      return { text: "", ocrConfidence: null as number | null, note: "slip_image_invalid_content_type" };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 128) {
      return { text: "", ocrConfidence: null as number | null, note: "slip_image_too_small" };
    }

    const worker = await getInternalOcrWorker();
    const result = await worker.recognize(Buffer.from(bytes));
    const text = String(result.data?.text ?? "").replace(/\r\n/g, "\n").trim();
    const words = Array.isArray(result.data?.words) ? result.data?.words : [];
    const confidences = words
      .map((word) => Number(word?.confidence))
      .filter((value) => Number.isFinite(value))
      .map((value) => value / 100);
    const ocrConfidence = confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null;
    return { text, ocrConfidence, note: null as string | null };
  } catch {
    return { text: "", ocrConfidence: null as number | null, note: "slip_ocr_failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyWithInternalEngine(input: {
  order: PackageSlipOrderSnapshot;
  submission: PackageSlipSubmission;
}) {
  const allowNoImage = String(process.env.PAYMENT_SLIP_INTERNAL_ALLOW_NO_IMAGE ?? "0").trim() === "1";
  const expectedAmount = Number(input.order.uniqueAmountThb);
  const expectedReceiver = normalizeDigits(input.order.promptpayTarget);

  const slipImageUrl = toStringOrNull(input.submission.slipImageUrl);
  const rawPayloadText = collectRawPayloadText(input.submission.rawPayload);
  const imageOcr = slipImageUrl ? await extractTextFromSlipImageUrl(slipImageUrl) : { text: "", ocrConfidence: null as number | null, note: "missing_slip_image" };
  const combinedText = [rawPayloadText, imageOcr.text].filter((part) => part.trim().length > 0).join("\n");
  const textNormalized = combinedText.replace(/\s+/g, " ").trim();

  const amounts = extractAmountCandidates(textNormalized);
  const amountFromOcr = pickAmountClosest(amounts, expectedAmount);

  const accountCandidates = extractAccountCandidates(textNormalized);
  const accountFromOcr = pickAccountCandidate(accountCandidates, expectedReceiver);

  const transferredAtFromOcr = extractTransferredAtFromText(textNormalized);
  const referenceFromOcr = extractReferenceFromText(textNormalized);
  const bankContext = detectBankContextFromText(textNormalized);
  const bankNameFromOcr = bankContext.bankName;
  const bankFormatMatched = bankContext.bankName ? bankContext.bankFormatMatched : true;

  const amountFinal = amountFromOcr ?? toNumberOrNull(input.submission.amountThb);
  const receiverFinal = accountFromOcr ?? normalizeDigits(input.submission.receiverAccount);
  const transferredAtFinal = transferredAtFromOcr ?? toStringOrNull(input.submission.transferredAt);
  const referenceFinal = referenceFromOcr ?? toStringOrNull(input.submission.reference);

  const amountMatched = amountFinal !== null && Number.isFinite(expectedAmount) ? Math.abs(Number(amountFinal) - expectedAmount) <= 0.01 : false;
  const receiverMatched = accountLooksLikeMatch(receiverFinal, expectedReceiver);
  const hasTransferTime = Boolean(transferredAtFinal);
  const hasImage = Boolean(slipImageUrl);
  const minOcrTextLengthRaw = Number(process.env.PAYMENT_SLIP_INTERNAL_MIN_OCR_TEXT_LENGTH ?? 40);
  const minOcrTextLength = Number.isFinite(minOcrTextLengthRaw) ? clamp(Math.floor(minOcrTextLengthRaw), 10, 300) : 40;
  const hasOcrText = textNormalized.length >= minOcrTextLength;
  const hasBank = Boolean(bankNameFromOcr);
  const hasReference = Boolean(referenceFromOcr);
  const tamperSignal =
    /(?:sample|photoshop|edited|fake|generated by ai|mockup)/i.test(textNormalized) ||
    (hasImage && !hasOcrText) ||
    (Boolean(bankNameFromOcr) && !bankFormatMatched);

  let confidence = 0.1;
  if (hasImage) confidence += 0.15;
  if (hasOcrText) confidence += 0.15;
  if (hasBank) confidence += 0.08;
  if (hasReference) confidence += 0.06;
  if (amountMatched) confidence += 0.24;
  if (receiverMatched) confidence += 0.15;
  if (hasTransferTime) confidence += 0.12;
  if (bankFormatMatched) confidence += 0.05;
  if (imageOcr.ocrConfidence !== null) confidence += clamp(imageOcr.ocrConfidence, 0, 1) * 0.05;
  if (bankNameFromOcr && !bankFormatMatched) confidence -= 0.1;
  if (tamperSignal) confidence -= 0.18;
  confidence = clamp(confidence, 0, 1);

  const suspicious = tamperSignal || (!allowNoImage && !hasImage);
  const providerVerified =
    amountMatched &&
    receiverMatched &&
    hasTransferTime &&
    hasImage &&
    bankFormatMatched &&
    !suspicious &&
    (hasOcrText || hasBank || hasReference || amountFromOcr !== null || accountFromOcr !== null);
  const ok = providerVerified;

  const notes: string[] = [];
  if (!hasImage && !allowNoImage) notes.push("missing_slip_image");
  if (!hasOcrText) notes.push("ocr_text_low");
  if (!amountMatched) notes.push("amount_not_matched");
  if (!receiverMatched) notes.push("receiver_not_matched");
  if (!hasTransferTime) notes.push("transfer_time_not_found");
  if (!hasBank) notes.push("bank_not_detected");
  if (hasBank && !bankFormatMatched) notes.push("bank_format_mismatch");
  if (tamperSignal) notes.push("possible_tamper_signal");
  if (imageOcr.note) notes.push(imageOcr.note);

  return {
    providerName: "internal_ocr",
    ok,
    providerVerified,
    reference: referenceFinal,
    amountThb: amountFinal,
    receiverAccount: receiverFinal || null,
    payerAccount: toStringOrNull(input.submission.payerAccount),
    payerName: toStringOrNull(input.submission.payerName),
    bankName: bankNameFromOcr,
    transferredAt: transferredAtFinal,
    confidenceScore: confidence,
    suspicious,
    note: notes.join(",") || null,
    rawPayload: {
      input: input.submission.rawPayload ?? {},
      internal: {
        ocrTextLength: textNormalized.length,
        ocrConfidence: imageOcr.ocrConfidence,
        matchedAmountFromOcr: amountFromOcr,
        matchedReceiverFromOcr: accountFromOcr,
        transferredAtFromOcr,
        referenceFromOcr,
        bankNameFromOcr,
        bankFormatMatched,
        bankMarkerMatched: bankContext.matchedMarker,
        notes,
      },
    },
  } satisfies PackageSlipProviderResult;
}

async function verifyWithExternalAdapter(input: {
  order: PackageSlipOrderSnapshot;
  submission: PackageSlipSubmission;
}) {
  const endpoint = String(process.env.PAYMENT_SLIP_VERIFY_ENDPOINT ?? "").trim();
  if (!endpoint) return null;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const bearer = String(process.env.PAYMENT_SLIP_VERIFY_BEARER ?? "").trim();
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        order: input.order,
        submission: input.submission,
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    return data as ExternalAdapterResponse;
  } catch {
    return null;
  }
}

function normalizeManualResult(input: { submission: PackageSlipSubmission }): PackageSlipProviderResult {
  const strict = String(process.env.PACKAGE_SLIP_REQUIRE_PROVIDER ?? "1").trim() !== "0";
  return {
    providerName: "manual",
    ok: strict ? false : true,
    providerVerified: false,
    reference: toStringOrNull(input.submission.reference),
    amountThb: toNumberOrNull(input.submission.amountThb),
    receiverAccount: toStringOrNull(input.submission.receiverAccount),
    payerAccount: toStringOrNull(input.submission.payerAccount),
    payerName: toStringOrNull(input.submission.payerName),
    bankName: null,
    transferredAt: toStringOrNull(input.submission.transferredAt),
    confidenceScore: null,
    suspicious: null,
    note: strict ? "provider_verification_required" : null,
    rawPayload: input.submission.rawPayload ?? {},
  };
}

export function isPaymentSlipProviderConfigured() {
  if (String(process.env.PAYMENT_SLIP_VERIFY_ENDPOINT ?? "").trim().length > 0) return true;
  return internalVerifierEnabled();
}

function normalizeExternalResult(input: {
  response: ExternalAdapterResponse;
  fallbackProviderName: string;
}): PackageSlipProviderResult {
  return {
    providerName: input.fallbackProviderName,
    ok: input.response.ok !== false,
    providerVerified: input.response.providerVerified !== false,
    reference: toStringOrNull(input.response.reference),
    amountThb: toNumberOrNull(input.response.amountThb),
    receiverAccount: toStringOrNull(input.response.receiverAccount),
    payerAccount: toStringOrNull(input.response.payerAccount),
    payerName: toStringOrNull(input.response.payerName),
    bankName: toStringOrNull(input.response.bankName),
    transferredAt: toStringOrNull(input.response.transferredAt),
    confidenceScore: toNumberOrNull(input.response.confidenceScore),
    suspicious: toBooleanOrNull(input.response.suspicious),
    note: toStringOrNull(input.response.note),
    rawPayload: input.response.rawPayload ?? input.response,
  };
}

export async function verifyPackageSlipWithProvider(input: {
  provider: string;
  order: PackageSlipOrderSnapshot;
  submission: PackageSlipSubmission;
}): Promise<PackageSlipProviderResult> {
  const providerName = String(input.provider || "manual").trim().slice(0, 40) || "manual";
  const external = await verifyWithExternalAdapter({
    order: input.order,
    submission: input.submission,
  });

  if (external) {
    return normalizeExternalResult({
      response: external,
      fallbackProviderName: providerName,
    });
  }

  if (internalVerifierEnabled()) {
    const internal = await verifyWithInternalEngine({
      order: input.order,
      submission: input.submission,
    });
    return internal;
  }

  return normalizeManualResult({
    submission: input.submission,
  });
}

