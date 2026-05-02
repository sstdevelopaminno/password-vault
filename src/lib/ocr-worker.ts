type OcrLanguageCode = "tha+eng" | "tha" | "eng";

type OcrBBox = {
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
};

type OcrWord = {
  text?: string;
  confidence?: number;
  bbox?: OcrBBox;
};

type OcrLine = {
  text?: string;
  confidence?: number;
  bbox?: OcrBBox;
  words?: OcrWord[];
};

type RecognizeResult = {
  data?: {
    text?: string;
    lines?: OcrLine[];
    words?: OcrWord[];
  };
};

type OcrWorker = {
  recognize: (input: File | Blob | HTMLCanvasElement) => Promise<RecognizeResult>;
  setParameters?: (params: Record<string, string | number>) => Promise<unknown>;
  terminate: () => Promise<void>;
};

const OCR_IDLE_DISPOSE_MS = 45_000;
const OCR_MAX_EDGE_PX = 2300;
const OCR_MAX_PIXELS = 3_000_000;
const OCR_MIN_WORD_CONFIDENCE = 26;
const OCR_MIN_WORD_CONFIDENCE_RELAXED = 18;
const OCR_LINE_GROUP_TOLERANCE_PX = 8;
const workerPromises = new Map<OcrLanguageCode, Promise<OcrWorker>>();
const progressHandlers = new Map<OcrLanguageCode, ((progress: number) => void) | undefined>();
const disposeTimers = new Map<OcrLanguageCode, ReturnType<typeof setTimeout>>();

function clearDisposeTimer(language: OcrLanguageCode) {
  const timer = disposeTimers.get(language);
  if (!timer) return;
  clearTimeout(timer);
  disposeTimers.delete(language);
}

function scheduleDispose(language: OcrLanguageCode) {
  clearDisposeTimer(language);
  const timer = setTimeout(() => {
    void disposeOcrWorker(language);
  }, OCR_IDLE_DISPOSE_MS);
  disposeTimers.set(language, timer);
}

async function createWorker(language: OcrLanguageCode): Promise<OcrWorker> {
  const tesseract = await import("tesseract.js");
  const create = tesseract.createWorker as unknown as (
    langs?: string | string[],
    oem?: number,
    options?: { logger?: (message: { status?: string; progress?: number }) => void },
  ) => Promise<OcrWorker>;

  const worker = await create(language, 1, {
    logger: (message) => {
      if (message.status !== "recognizing text") return;
      const handler = progressHandlers.get(language);
      if (!handler) return;
      const value = Math.max(0, Math.min(1, Number(message.progress ?? 0)));
      handler(value);
    },
  });

  try {
    const psmAuto = Number((tesseract as { PSM?: { AUTO?: number | string } }).PSM?.AUTO ?? 3);
    await worker.setParameters?.({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
      tessedit_pageseg_mode: Number.isFinite(psmAuto) ? psmAuto : 3,
    });
  } catch {
    // keep OCR available even if parameter tuning is unsupported
  }

  return worker;
}

async function getWorker(language: OcrLanguageCode): Promise<OcrWorker> {
  const existing = workerPromises.get(language);
  if (existing) return existing;

  const pending = createWorker(language);
  workerPromises.set(language, pending);
  try {
    return await pending;
  } catch (error) {
    workerPromises.delete(language);
    throw error;
  }
}

function safeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function cleanToken(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function tokenLooksUsable(token: string) {
  if (!token) return false;
  return /[\p{L}\p{N}]/u.test(token) || token.length >= 2;
}

function shouldKeepWord(word: OcrWord) {
  const token = cleanToken(String(word.text ?? ""));
  if (!tokenLooksUsable(token)) return false;
  const confidence = safeNumber(word.confidence);
  if (confidence >= OCR_MIN_WORD_CONFIDENCE) return true;
  if (token.length >= 4 && confidence >= OCR_MIN_WORD_CONFIDENCE_RELAXED) return true;
  return false;
}

function sortByReadingOrder<T extends { bbox?: OcrBBox }>(items: T[]) {
  return [...items].sort((a, b) => {
    const ay = safeNumber(a.bbox?.y0);
    const by = safeNumber(b.bbox?.y0);
    if (Math.abs(ay - by) > OCR_LINE_GROUP_TOLERANCE_PX) return ay - by;
    const ax = safeNumber(a.bbox?.x0);
    const bx = safeNumber(b.bbox?.x0);
    return ax - bx;
  });
}

function buildLineText(line: OcrLine) {
  const directLineText = cleanToken(String(line.text ?? ""));
  if (directLineText) return directLineText;

  const words = Array.isArray(line.words) ? sortByReadingOrder(line.words) : [];
  if (words.length === 0) return "";

  const trusted = words
    .filter((word) => shouldKeepWord(word))
    .map((word) => cleanToken(String(word.text ?? "")))
    .filter((token) => token.length > 0);
  return trusted.join(" ");
}

function extractStableText(result: RecognizeResult) {
  const lines = Array.isArray(result.data?.lines) ? result.data?.lines : [];
  if (lines && lines.length > 0) {
    const ordered = sortByReadingOrder(lines);
    const normalized: string[] = [];
    for (const line of ordered) {
      const text = buildLineText(line);
      if (!text) continue;
      if (normalized[normalized.length - 1] === text) continue;
      normalized.push(text);
    }
    if (normalized.length > 0) {
      return normalized.join("\n");
    }
  }
  const raw = String(result.data?.text ?? "").replace(/\r\n/g, "\n");
  return raw
    .split("\n")
    .map((line) => cleanToken(line))
    .filter((line) => line.length > 0)
    .join("\n");
}

async function preprocessImageForOcr(file: File): Promise<File | HTMLCanvasElement> {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const width = safeNumber(bitmap.width);
    const height = safeNumber(bitmap.height);
    if (width <= 0 || height <= 0) return file;

    const scaleByEdge = Math.min(1, OCR_MAX_EDGE_PX / Math.max(width, height));
    const scaleByPixels = Math.min(1, Math.sqrt(OCR_MAX_PIXELS / (width * height)));
    const scale = Math.min(scaleByEdge, scaleByPixels);
    if (scale >= 0.995) return file;

    const targetWidth = Math.max(64, Math.round(width * scale));
    const targetHeight = Math.max(64, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    return canvas;
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

export async function recognizeImageWithOcr(input: {
  file: File;
  language: OcrLanguageCode;
  onProgress?: (progress: number) => void;
}) {
  progressHandlers.set(input.language, input.onProgress);
  clearDisposeTimer(input.language);

  const worker = await getWorker(input.language);
  try {
    const preparedInput = await preprocessImageForOcr(input.file);
    const result = await worker.recognize(preparedInput);
    return extractStableText(result).trim();
  } finally {
    progressHandlers.delete(input.language);
    scheduleDispose(input.language);
  }
}

export async function disposeOcrWorker(language: OcrLanguageCode) {
  clearDisposeTimer(language);
  progressHandlers.delete(language);
  const pending = workerPromises.get(language);
  if (!pending) return;
  workerPromises.delete(language);
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // ignore worker termination errors
  }
}
