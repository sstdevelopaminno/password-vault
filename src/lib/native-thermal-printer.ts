import type { BillingDocumentView } from '@/lib/billing';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import type { NativePrinterDevice, NativePrinterType } from '@/types/thermal-printer';

export type SavedNativePrinter = {
  type: NativePrinterType;
  id: string;
  name: string;
};

const STORAGE_KEY = 'pv_billing_native_printer_v1';
const NATIVE_BRIDGE_WAIT_TIMEOUT_MS = 2500;

function isNativePrinterRuntime() {
  const runtime = detectRuntimeCapabilities();
  return runtime.isCapacitorNative && runtime.isAndroid;
}

function hasNativePrinterBridge() {
  return typeof window !== 'undefined' && typeof window.ThermalPrinter !== 'undefined';
}

function toErrorMessage(input: unknown) {
  if (input instanceof Error) return input.message;
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const error = typeof record.error === 'string' ? record.error : '';
    const message = typeof record.message === 'string' ? record.message : '';
    if (error) return error;
    if (message) return message;
    try {
      return JSON.stringify(record);
    } catch {
      return '';
    }
  }
  return '';
}

function toError(input: unknown, fallback = 'Thermal printer request failed') {
  const message = toErrorMessage(input).trim();
  const lowered = message.toLowerCase();
  if (lowered.includes('missing permission for android.permission.bluetooth')) {
    return new Error('Bluetooth permission is missing. Please allow Nearby devices/Bluetooth in Android settings, then reopen the app.');
  }
  if (lowered.includes('device not enabled bluetooth')) {
    return new Error('Bluetooth is off. Please turn on Bluetooth and try again.');
  }
  return new Error(message || fallback);
}

function callNative<T>(fn: (success: (result: T) => void, error: (err: unknown) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      fn(resolve, (err) => reject(toError(err)));
    } catch (error) {
      reject(toError(error));
    }
  });
}

function normalizeDeviceId(input: NativePrinterDevice) {
  const raw = input.id ?? input.address ?? '';
  return String(raw).trim();
}

export function canUseNativePrinter() {
  if (!isNativePrinterRuntime()) return false;
  return hasNativePrinterBridge();
}

export async function waitForNativePrinterBridge(timeoutMs = NATIVE_BRIDGE_WAIT_TIMEOUT_MS) {
  if (canUseNativePrinter()) return true;
  if (typeof window === 'undefined') return false;
  if (!isNativePrinterRuntime()) return false;

  return new Promise<boolean>((resolve) => {
    let done = false;
    const deadline = Date.now() + Math.max(0, timeoutMs);

    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(intervalId);
      document.removeEventListener('deviceready', handleReady as EventListener);
      resolve(value);
    };

    const tick = () => {
      if (canUseNativePrinter()) {
        finish(true);
        return;
      }
      if (Date.now() >= deadline) {
        finish(false);
      }
    };

    const handleReady = () => {
      tick();
    };

    const intervalId = window.setInterval(tick, 120);
    document.addEventListener('deviceready', handleReady as EventListener);
    tick();
  });
}

export async function listNativePrinters(type: NativePrinterType) {
  const ready = await waitForNativePrinterBridge();
  if (!ready || !window.ThermalPrinter) return [];
  const result = await callNative<NativePrinterDevice[] | { printers?: NativePrinterDevice[] }>((success, error) => {
    window.ThermalPrinter!.listPrinters({ type }, success, error);
  });
  const rows = Array.isArray(result) ? result : Array.isArray(result?.printers) ? result.printers : [];
  return rows
    .map((row) => {
      const id = normalizeDeviceId(row);
      const name = String(row.deviceName || row.name || row.address || id || 'Printer').trim();
      if (!id) return null;
      return {
        id,
        name,
        raw: row,
      };
    })
    .filter((item): item is { id: string; name: string; raw: NativePrinterDevice } => Boolean(item));
}

export function saveSelectedNativePrinter(device: SavedNativePrinter | null) {
  if (typeof window === 'undefined') return;
  if (!device) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
}

export function loadSelectedNativePrinter(): SavedNativePrinter | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedNativePrinter>;
    const type = parsed.type === 'usb' ? 'usb' : parsed.type === 'bluetooth' ? 'bluetooth' : null;
    const id = String(parsed.id || '').trim();
    const name = String(parsed.name || '').trim();
    if (!type || !id) return null;
    return { type, id, name: name || id };
  } catch {
    return null;
  }
}

export async function requestNativePrinterPermission(type: NativePrinterType, id: string) {
  const ready = await waitForNativePrinterBridge();
  if (!ready || !window.ThermalPrinter) return;
  await callNative((success, error) => {
    window.ThermalPrinter!.requestPermissions({ type, id }, success, error);
  });
}

function escposLine(label: string, value: string) {
  return '[L]' + label + '[R]' + value + '\n';
}

function toThaiDate(input: string | null | undefined) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toAmount(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function trimLine(input: string, max = 32) {
  const normalized = String(input || '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, Math.max(0, max - 3)) + '...';
}

export function buildEscPos80mmReceipt(document: BillingDocumentView) {
  const title = document.docKind === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้';
  const lines: string[] = [];

  lines.push('[C]<b>' + trimLine(document.sellerName || 'My Store', 32) + '</b>\n');
  if (document.sellerAddress) {
    lines.push('[C]' + trimLine(document.sellerAddress, 40) + '\n');
  }
  lines.push('[C]' + title + '\n');
  lines.push('[C]------------------------------\n');
  lines.push(escposLine('เลขที่', document.documentNo || '-'));
  lines.push(escposLine('วันที่', toThaiDate(document.issueDate)));
  if (document.docKind === 'invoice') {
    lines.push(escposLine('ครบกำหนด', toThaiDate(document.dueDate)));
  }
  lines.push(escposLine('ลูกค้า', trimLine(document.buyerName || '-', 18)));
  lines.push('[C]------------------------------\n');

  for (const line of document.lines) {
    const description = trimLine(line.description || '-', 30);
    const total = Number(line.qty || 0) * Number(line.unitPrice || 0);
    lines.push('[L]' + description + '\n');
    lines.push('[L]' + Number(line.qty || 0) + ' x ' + toAmount(Number(line.unitPrice || 0)) + '[R]' + toAmount(total) + '\n');
  }

  lines.push('[C]------------------------------\n');
  lines.push(escposLine('รวม', toAmount(Number(document.subtotal || 0))));
  if (Number(document.discountAmount || 0) > 0) {
    lines.push(escposLine('ส่วนลด', '-' + toAmount(Number(document.discountAmount || 0))));
  }
  lines.push(escposLine('VAT ' + Number(document.vatPercent || 0) + '%', toAmount(Number(document.vatAmount || 0))));
  lines.push('[L]<b>ยอดสุทธิ</b>[R]<b>' + toAmount(Number(document.grandTotal || 0)) + '</b>\n');

  lines.push('[C]------------------------------\n');
  lines.push('[C]ขอบคุณที่ใช้บริการ\n');
  lines.push('\n\n');
  return lines.join('');
}

async function printRaw(input: { printer: SavedNativePrinter; text: string }) {
  const ready = await waitForNativePrinterBridge();
  if (!ready || !window.ThermalPrinter) {
    throw new Error('Native printer bridge is not ready. Please reopen the app and try again.');
  }

  if (input.printer.type === 'usb') {
    await requestNativePrinterPermission('usb', input.printer.id);
  }

  const payload = {
    type: input.printer.type,
    id: input.printer.id,
    text: input.text,
    mmFeedPaper: 20,
  } as const;

  await callNative((success, error) => {
    window.ThermalPrinter!.printFormattedText(payload, success, error);
  });

  await callNative((success, error) => {
    window.ThermalPrinter!.disconnectPrinter({ type: input.printer.type, id: input.printer.id }, success, error);
  }).catch(() => undefined);
}

export async function printEscPos80mm(input: { document: BillingDocumentView; printer: SavedNativePrinter }) {
  await printRaw({
    printer: input.printer,
    text: buildEscPos80mmReceipt(input.document),
  });
}

function wrapEscPosLines(input: string, maxCharsPerLine = 32) {
  const rawLines = String(input || "").replace(/\r/g, "").split("\n");
  const output: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      output.push("");
      continue;
    }

    let cursor = line;
    while (cursor.length > maxCharsPerLine) {
      output.push(cursor.slice(0, maxCharsPerLine));
      cursor = cursor.slice(maxCharsPerLine);
    }
    output.push(cursor);
  }

  return output;
}

export function buildEscPosText80mm(input: {
  title: string;
  body: string;
  footerLines?: string[];
}) {
  const lines: string[] = [];
  lines.push("[C]<b>" + trimLine(input.title || "Document", 32) + "</b>\n");
  lines.push("[C]------------------------------\n");

  const wrappedBody = wrapEscPosLines(input.body || "-", 32);
  for (const bodyLine of wrappedBody) {
    lines.push("[L]" + (bodyLine || " ") + "\n");
  }

  if (input.footerLines?.length) {
    lines.push("[C]------------------------------\n");
    for (const footerLine of input.footerLines) {
      const wrappedFooter = wrapEscPosLines(footerLine, 32);
      for (const line of wrappedFooter) {
        lines.push("[L]" + line + "\n");
      }
    }
  }

  lines.push("\n\n");
  return lines.join("");
}

export async function printEscPosText80mm(input: {
  printer: SavedNativePrinter;
  title: string;
  body: string;
  footerLines?: string[];
}) {
  await printRaw({
    printer: input.printer,
    text: buildEscPosText80mm({
      title: input.title,
      body: input.body,
      footerLines: input.footerLines,
    }),
  });
}

export async function printEscPosTest80mm(input: { printer: SavedNativePrinter; sellerName?: string }) {
  const now = new Date();
  const text =
    '[C]<b>' + trimLine(input.sellerName || 'My Store', 32) + '</b>\n' +
    '[C]TEST PRINT / ทดสอบพิมพ์\n' +
    '[C]------------------------------\n' +
    '[L]Date[R]' + now.toLocaleString('th-TH') + '\n' +
    '[L]Printer[R]' + (input.printer.type === 'usb' ? 'USB' : 'Bluetooth') + '\n' +
    '[L]Status[R]OK\n' +
    '[C]------------------------------\n' +
    '[C]หากอ่านข้อความนี้ได้ เครื่องพิมพ์พร้อมใช้งาน\n\n\n';

  await printRaw({
    printer: input.printer,
    text,
  });
}
