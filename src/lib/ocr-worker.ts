type OcrLanguageCode = "tha+eng" | "tha" | "eng";

type RecognizeResult = {
  data?: {
    text?: string;
  };
};

type OcrWorker = {
  recognize: (input: File) => Promise<RecognizeResult>;
  terminate: () => Promise<void>;
};

const OCR_IDLE_DISPOSE_MS = 45_000;
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

  return create(language, 1, {
    logger: (message) => {
      if (message.status !== "recognizing text") return;
      const handler = progressHandlers.get(language);
      if (!handler) return;
      const value = Math.max(0, Math.min(1, Number(message.progress ?? 0)));
      handler(value);
    },
  });
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

export async function recognizeImageWithOcr(input: {
  file: File;
  language: OcrLanguageCode;
  onProgress?: (progress: number) => void;
}) {
  progressHandlers.set(input.language, input.onProgress);
  clearDisposeTimer(input.language);

  const worker = await getWorker(input.language);
  try {
    const result = await worker.recognize(input.file);
    return String(result.data?.text ?? "").replace(/\r\n/g, "\n").trim();
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
