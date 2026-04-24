'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  ImageUp,
  Inbox,
  Loader2,
  Mail,
  PenSquare,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';
import { fetchWithSessionRetry } from '@/lib/api-client';
import { computeBillingTotals, formatCurrency, normalizeText, type BillingDocKind, type BillingLine, type BillingTemplate } from '@/lib/billing';
import { disposeOcrWorker, recognizeImageWithOcr } from '@/lib/ocr-worker';

type BillDraft = {
  docKind: BillingDocKind;
  template: BillingTemplate;
  documentNo: string;
  referenceNo: string;
  issueDate: string;
  dueDate: string;
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
  emailTo: string;
  emailMessage: string;
  lines: BillingLine[];
};

type BillingDocumentRecord = {
  id: string;
  shareToken: string;
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

type BillingEmailQueueRecord = {
  id: number;
  documentId: string;
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
  toEmail: string;
  message: string;
  scheduledAt: string;
  sentAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastError: string;
  createdAt: string;
};

type NotesImportRecord = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

type ActiveTab = 'queue' | 'documents';
type PendingAction = null | 'save' | 'queue' | 'send' | 'delete' | 'delete_all';
type BillingQueueStatus = BillingEmailQueueRecord['status'];
type OcrLanguageCode = 'tha+eng' | 'tha' | 'eng';
type CreatorStage = null | 'kind' | 'template';
type EditorStep = 'document' | 'parties' | 'items' | 'summary';
type SaveFeedback = null | 'saving' | 'success';
const DOCUMENTS_PER_PAGE = 8;
const EMAIL_QUEUE_PER_PAGE = 8;

function toTwoDigits(value: number) {
  return String(value).padStart(2, '0');
}

function todayLocalDate() {
  const now = new Date();
  return now.getFullYear() + '-' + toTwoDigits(now.getMonth() + 1) + '-' + toTwoDigits(now.getDate());
}

function nextWeekLocalDate() {
  const now = new Date();
  now.setDate(now.getDate() + 7);
  return now.getFullYear() + '-' + toTwoDigits(now.getMonth() + 1) + '-' + toTwoDigits(now.getDate());
}

function localDateTimeAfter(minutes: number) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  return (
    now.getFullYear() +
    '-' +
    toTwoDigits(now.getMonth() + 1) +
    '-' +
    toTwoDigits(now.getDate()) +
    'T' +
    toTwoDigits(now.getHours()) +
    ':' +
    toTwoDigits(now.getMinutes())
  );
}

function fromLocalDateTimeInputValue(raw: string) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function parseNumberInput(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMoneyValue(value: string) {
  const numeric = Number(value.replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function parseQtyValue(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function toEditorLinesFromText(rawText: string, maxLines = 30): BillingLine[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blockedHeadings = /^(total|subtotal|grand total|vat|tax|amount due|ยอดรวม|รวมสุทธิ|ภาษี|รวมทั้งสิ้น)/i;
  const lines = normalized.split('\n');
  const result: BillingLine[] = [];

  for (const rawLine of lines) {
    if (result.length >= maxLines) break;
    const cleaned = rawLine.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const stripped = cleaned.replace(/^(?:[-*]+|\u2022+|\d+[.)])\s*/, '').trim();
    if (!stripped || blockedHeadings.test(stripped)) continue;

    const qtyXPrice = stripped.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[xX*]\s*([0-9][0-9,]*(?:\.\d{1,2})?)$/);
    if (qtyXPrice) {
      const description = normalizeText(qtyXPrice[1], 240);
      const qty = parseQtyValue(qtyXPrice[2]);
      const unitPrice = parseMoneyValue(qtyXPrice[3]);
      if (description && qty && unitPrice !== null) {
        result.push({ description, qty, unitPrice });
        continue;
      }
    }

    const pipeTokens = stripped.split('|').map((token) => token.trim()).filter(Boolean);
    if (pipeTokens.length >= 3) {
      const description = normalizeText(pipeTokens[0], 240);
      const qty = parseQtyValue(pipeTokens[1]);
      const unitPrice = parseMoneyValue(pipeTokens[2]);
      if (description && qty && unitPrice !== null) {
        result.push({ description, qty, unitPrice });
        continue;
      }
    }

    const tokens = stripped.split(' ').filter(Boolean);
    if (tokens.length >= 3) {
      const last = tokens[tokens.length - 1];
      const secondLast = tokens[tokens.length - 2];
      const qty = parseQtyValue(secondLast);
      const unitPrice = parseMoneyValue(last);
      const description = normalizeText(tokens.slice(0, -2).join(' '), 240);
      if (description && qty && unitPrice !== null) {
        result.push({ description, qty, unitPrice });
        continue;
      }
    }

    const trailingPrice = stripped.match(/^(.+?)\s+([0-9][0-9,]*(?:\.\d{1,2})?)$/);
    if (trailingPrice) {
      const description = normalizeText(trailingPrice[1], 240);
      const unitPrice = parseMoneyValue(trailingPrice[2]);
      if (description && unitPrice !== null) {
        result.push({ description, qty: 1, unitPrice });
        continue;
      }
    }

    const fallbackDescription = normalizeText(stripped, 240);
    if (fallbackDescription) {
      result.push({ description: fallbackDescription, qty: 1, unitPrice: 0 });
    }
  }

  return result;
}

function formatDateDisplay(value: string | null, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTimeDisplay(value: string | null, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createDocumentNo(prefix: 'RE' | 'INV') {
  const now = new Date();
  const datePart = now.getFullYear() + toTwoDigits(now.getMonth() + 1) + toTwoDigits(now.getDate());
  const randomPart = Math.floor(100 + Math.random() * 900);
  return prefix + datePart + randomPart;
}

function getQueueStatusBadgeClass(status: BillingQueueStatus) {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-rose-100 text-rose-700';
  if (status === 'processing') return 'bg-blue-100 text-blue-700';
  if (status === 'cancelled') return 'bg-slate-200 text-slate-700';
  return 'bg-amber-100 text-amber-700';
}

function getQueueStatusLabel(status: BillingQueueStatus, locale: string) {
  if (status === 'sent') return locale === 'th' ? 'ส่งแล้ว' : 'Sent';
  if (status === 'failed') return locale === 'th' ? 'ส่งไม่สำเร็จ' : 'Failed';
  if (status === 'processing') return locale === 'th' ? 'กำลังส่ง' : 'Processing';
  if (status === 'cancelled') return locale === 'th' ? 'ยกเลิก' : 'Cancelled';
  return locale === 'th' ? 'รอส่ง' : 'Pending';
}

function formatQueueError(raw: string, locale: string) {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  const mapError = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes('api key is invalid')) {
      return locale === 'th'
        ? 'ส่งอีเมลไม่สำเร็จ: API key ของบริการอีเมลไม่ถูกต้อง'
        : 'Email delivery failed: email provider API key is invalid.';
    }
    return message;
  };

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      const message = String(parsed.message ?? parsed.error ?? '').trim();
      if (message) return mapError(message);
    } catch {
      // fallback below
    }
  }

  if (text) return mapError(text);
  return locale === 'th' ? 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' : 'Email delivery failed. Please try again.';
}

function makeDefaultDraft(locale: string): BillDraft {
  const isTh = locale === 'th';
  return {
    docKind: 'receipt',
    template: 'a4',
    documentNo: createDocumentNo('RE'),
    referenceNo: createDocumentNo('INV'),
    issueDate: todayLocalDate(),
    dueDate: nextWeekLocalDate(),
    sellerName: isTh ? 'ร้านของฉัน' : 'My Store',
    sellerAddress: isTh ? 'ที่อยู่ร้าน / สาขา' : 'Store address / branch',
    sellerTaxId: '',
    buyerName: '',
    buyerAddress: '',
    buyerTaxId: '',
    contactName: '',
    contactPhone: '',
    paymentMethod: 'cash',
    noteMessage: '',
    discountPercent: 0,
    vatPercent: 7,
    currency: 'THB',
    emailTo: '',
    emailMessage: '',
    lines: [{ description: isTh ? 'รายการสินค้า/บริการ' : 'Product/Service item', qty: 1, unitPrice: 0 }],
  };
}

function toDraftFromDocument(document: BillingDocumentRecord, locale: string): BillDraft {
  return {
    docKind: document.docKind,
    template: document.template,
    documentNo: document.documentNo,
    referenceNo: document.referenceNo || '',
    issueDate: document.issueDate,
    dueDate: document.dueDate || '',
    sellerName: document.sellerName,
    sellerAddress: document.sellerAddress,
    sellerTaxId: document.sellerTaxId,
    buyerName: document.buyerName,
    buyerAddress: document.buyerAddress,
    buyerTaxId: document.buyerTaxId,
    contactName: document.contactName,
    contactPhone: document.contactPhone,
    paymentMethod: document.paymentMethod,
    noteMessage: document.noteMessage,
    discountPercent: document.discountPercent,
    vatPercent: document.vatPercent,
    currency: document.currency || 'THB',
    emailTo: document.emailTo || '',
    emailMessage: document.emailMessage || '',
    lines: document.lines.length > 0 ? document.lines : [{ description: locale === 'th' ? 'รายการสินค้า/บริการ' : 'Product/Service item', qty: 1, unitPrice: 0 }],
  };
}

export default function BillingPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const tr = useCallback((th: string, en: string) => (locale === 'th' ? th : en), [locale]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('documents');
  const [documents, setDocuments] = useState<BillingDocumentRecord[]>([]);
  const [emailQueue, setEmailQueue] = useState<BillingEmailQueueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [documentsPage, setDocumentsPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);

  const [editorOpen, setEditorOpen] = useState(false);
  const [creatorStage, setCreatorStage] = useState<CreatorStage>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<BillDraft>(() => makeDefaultDraft(locale));
  const [editorStep, setEditorStep] = useState<EditorStep>('document');
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);

  const [detailDocumentId, setDetailDocumentId] = useState<string | null>(null);
  const [detailEmailTo, setDetailEmailTo] = useState('');
  const [detailScheduleAt, setDetailScheduleAt] = useState(localDateTimeAfter(30));
  const [detailEmailMessage, setDetailEmailMessage] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<BillingTemplate>('a4');

  const [notesImportOpen, setNotesImportOpen] = useState(false);
  const [notesImportQuery, setNotesImportQuery] = useState('');
  const [notesImportLoading, setNotesImportLoading] = useState(false);
  const [notesImportResults, setNotesImportResults] = useState<NotesImportRecord[]>([]);

  const [lineOcrRunning, setLineOcrRunning] = useState(false);
  const [lineOcrProgress, setLineOcrProgress] = useState(0);
  const [lineOcrLanguage] = useState<OcrLanguageCode>('tha+eng');
  const [lineOcrPreviewOpen, setLineOcrPreviewOpen] = useState(false);
  const [lineOcrPreviewText, setLineOcrPreviewText] = useState('');
  const lineOcrInputRef = useRef<HTMLInputElement | null>(null);

  const queueCountByDocument = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of emailQueue) {
      map.set(item.documentId, (map.get(item.documentId) ?? 0) + 1);
    }
    return map;
  }, [emailQueue]);

  const selectedDetailDocument = useMemo(
    () => documents.find((item) => item.id === detailDocumentId) ?? null,
    [detailDocumentId, documents],
  );

  const selectedDetailQueue = useMemo(
    () => (selectedDetailDocument ? emailQueue.filter((item) => item.documentId === selectedDetailDocument.id) : []),
    [emailQueue, selectedDetailDocument],
  );

  const totalDocumentPages = useMemo(
    () => Math.max(1, Math.ceil(documents.length / DOCUMENTS_PER_PAGE)),
    [documents.length],
  );

  const pagedDocuments = useMemo(() => {
    const start = (documentsPage - 1) * DOCUMENTS_PER_PAGE;
    return documents.slice(start, start + DOCUMENTS_PER_PAGE);
  }, [documents, documentsPage]);

  const totalQueuePages = useMemo(
    () => Math.max(1, Math.ceil(emailQueue.length / EMAIL_QUEUE_PER_PAGE)),
    [emailQueue.length],
  );

  const pagedEmailQueue = useMemo(() => {
    const start = (queuePage - 1) * EMAIL_QUEUE_PER_PAGE;
    return emailQueue.slice(start, start + EMAIL_QUEUE_PER_PAGE);
  }, [emailQueue, queuePage]);

  const editorTotals = useMemo(
    () => computeBillingTotals(editorDraft.lines, editorDraft.discountPercent, editorDraft.vatPercent),
    [editorDraft.discountPercent, editorDraft.lines, editorDraft.vatPercent],
  );

  const deletingInProgress = pendingAction === 'delete' || pendingAction === 'delete_all';

  const loadBillingData = useCallback(async () => {
    setLoading(true);
    try {
      const [documentsRes, queueRes] = await Promise.all([
        fetchWithSessionRetry('/api/billing/documents?limit=100', { cache: 'no-store' }),
        fetchWithSessionRetry('/api/billing/email-queue?limit=120', { cache: 'no-store' }),
      ]);

      const documentsBody = await documentsRes.json().catch(() => ({}));
      const queueBody = await queueRes.json().catch(() => ({}));
      if (!documentsRes.ok) {
        throw new Error(String((documentsBody as { error?: string }).error || tr('โหลดรายการเอกสารไม่สำเร็จ', 'Failed to load billing documents')));
      }
      if (!queueRes.ok) {
        throw new Error(String((queueBody as { error?: string }).error || tr('โหลดคิวอีเมลไม่สำเร็จ', 'Failed to load email queue')));
      }

      const nextDocuments = Array.isArray((documentsBody as { documents?: BillingDocumentRecord[] }).documents)
        ? (documentsBody as { documents: BillingDocumentRecord[] }).documents
        : [];
      const nextQueue = Array.isArray((queueBody as { jobs?: BillingEmailQueueRecord[] }).jobs)
        ? (queueBody as { jobs: BillingEmailQueueRecord[] }).jobs
        : [];

      setDocuments(nextDocuments);
      setEmailQueue(nextQueue);
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('โหลดข้อมูลไม่สำเร็จ', 'Failed to load data'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr]);

  useEffect(() => {
    loadBillingData().catch(() => undefined);
  }, [loadBillingData]);

  useEffect(() => {
    return () => {
      void disposeOcrWorker('tha+eng');
      void disposeOcrWorker('tha');
      void disposeOcrWorker('eng');
    };
  }, []);

  useEffect(() => {
    setDocumentsPage((prev) => Math.min(prev, totalDocumentPages));
  }, [totalDocumentPages]);

  useEffect(() => {
    setQueuePage((prev) => Math.min(prev, totalQueuePages));
  }, [totalQueuePages]);

  function openCreateDocumentModal() {
    setEditingDocumentId(null);
    setEditorDraft(makeDefaultDraft(locale));
    setEditorStep('document');
    setSaveFeedback(null);
    setCreatorStage('kind');
  }

  function openEditDocumentModal(document: BillingDocumentRecord) {
    setEditingDocumentId(document.id);
    setEditorDraft(toDraftFromDocument(document, locale));
    setEditorStep('document');
    setSaveFeedback(null);
    setCreatorStage(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setCreatorStage(null);
    setSaveFeedback(null);
    setEditingDocumentId(null);
  }

  function selectCreateKind(kind: BillingDocKind) {
    const prefix = kind === 'receipt' ? 'RE' : 'INV';
    setEditorDraft((prev) => ({
      ...prev,
      docKind: kind,
      documentNo: createDocumentNo(prefix),
      referenceNo: '',
    }));
    setCreatorStage('template');
  }

  function selectCreateTemplate(template: BillingTemplate) {
    setEditorDraft((prev) => ({ ...prev, template }));
    setCreatorStage(null);
    setEditorStep('document');
    setEditorOpen(true);
  }

  function goNextEditorStep() {
    setEditorStep((prev) => {
      if (prev === 'document') return 'parties';
      if (prev === 'parties') return 'items';
      return 'summary';
    });
  }

  function goPrevEditorStep() {
    setEditorStep((prev) => {
      if (prev === 'summary') return 'items';
      if (prev === 'items') return 'parties';
      if (prev === 'parties') return 'document';
      return 'document';
    });
  }

  function openDetailModal(document: BillingDocumentRecord) {
    setDetailDocumentId(document.id);
    setDetailEmailTo(document.emailTo || '');
    setDetailEmailMessage(document.emailMessage || '');
    setDetailScheduleAt(localDateTimeAfter(30));
  }

  function closeDetailModal() {
    setDetailDocumentId(null);
    setDetailEmailTo('');
    setDetailEmailMessage('');
  }

  function openPreview(documentId: string, template: BillingTemplate) {
    setPreviewDocumentId(documentId);
    setPreviewTemplate(template);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewDocumentId(null);
  }

  function updateEditorDraft<K extends keyof BillDraft>(key: K, value: BillDraft[K]) {
    setEditorDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateEditorLine(index: number, patch: Partial<BillingLine>) {
    setEditorDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  }

  function addEditorLine() {
    setEditorDraft((prev) => ({
      ...prev,
      lines: [...prev.lines, { description: '', qty: 1, unitPrice: 0 }],
    }));
  }

  function removeEditorLine(index: number) {
    setEditorDraft((prev) => {
      if (prev.lines.length <= 1) return prev;
      return {
        ...prev,
        lines: prev.lines.filter((_, lineIndex) => lineIndex !== index),
      };
    });
  }

  function replaceEditorLines(nextLines: BillingLine[]) {
    if (nextLines.length === 0) return;
    setEditorDraft((prev) => ({
      ...prev,
      lines: nextLines.slice(0, 60),
    }));
  }

  function appendEditorLines(nextLines: BillingLine[]) {
    if (nextLines.length === 0) return;
    setEditorDraft((prev) => {
      const currentLines = prev.lines.filter((line) => {
        return normalizeText(line.description, 240) || Number(line.qty) > 0 || Number(line.unitPrice) > 0;
      });
      const merged = [...currentLines, ...nextLines].slice(0, 60);
      return {
        ...prev,
        lines: merged.length > 0 ? merged : [{ description: '', qty: 1, unitPrice: 0 }],
      };
    });
  }

  function appendToEditorNoteMessage(text: string) {
    const safeText = normalizeText(text, 1200);
    if (!safeText) return;
    setEditorDraft((prev) => {
      if (!prev.noteMessage.trim()) {
        return { ...prev, noteMessage: safeText };
      }
      return { ...prev, noteMessage: prev.noteMessage.trim() + '\n\n' + safeText };
    });
  }

  const loadNotesImport = useCallback(
    async (query: string) => {
      setNotesImportLoading(true);
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '30',
        });
        const normalizedQuery = query.trim();
        if (normalizedQuery) {
          params.set('q', normalizedQuery);
        }

        const response = await fetchWithSessionRetry('/api/notes?' + params.toString(), { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          notes?: Array<{ id?: string; title?: string; content?: string; updatedAt?: string }>;
        };
        if (!response.ok) {
          throw new Error(body.error || tr('โหลดโน้ตไม่สำเร็จ', 'Failed to load notes'));
        }

        const records = Array.isArray(body.notes)
          ? body.notes
              .map((note) => ({
                id: String(note.id ?? ''),
                title: String(note.title ?? '').trim(),
                content: String(note.content ?? '').trim(),
                updatedAt: String(note.updatedAt ?? ''),
              }))
              .filter((note) => note.id && (note.title || note.content))
          : [];
        setNotesImportResults(records);
      } catch (error) {
        showToast(error instanceof Error ? error.message : tr('โหลดโน้ตไม่สำเร็จ', 'Failed to load notes'), 'error');
        setNotesImportResults([]);
      } finally {
        setNotesImportLoading(false);
      }
    },
    [showToast, tr],
  );

  function openNotesImportModal() {
    setNotesImportOpen(true);
    if (notesImportResults.length === 0) {
      void loadNotesImport(notesImportQuery);
    }
  }

  function closeNotesImportModal() {
    setNotesImportOpen(false);
  }

  useEffect(() => {
    if (!notesImportOpen) return;
    const timer = window.setTimeout(() => {
      void loadNotesImport(notesImportQuery);
    }, 260);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadNotesImport, notesImportOpen, notesImportQuery]);

  function importNoteAsLineItems(note: NotesImportRecord, mode: 'append' | 'replace') {
    const sourceText = [note.title, note.content].filter(Boolean).join('\n');
    const importedLines = toEditorLinesFromText(sourceText);
    if (importedLines.length === 0) {
      showToast(tr('ไม่พบรายการที่ใช้ได้ในโน้ตที่เลือก', 'No importable line items found in selected note'), 'error');
      return;
    }
    if (mode === 'replace') {
      replaceEditorLines(importedLines);
    } else {
      appendEditorLines(importedLines);
    }
    showToast(tr('ดึงข้อมูลจากโน้ตเรียบร้อย', 'Imported content from note'));
    setNotesImportOpen(false);
  }

  function importNoteToMessage(note: NotesImportRecord) {
    const composedText = [note.title, note.content].filter(Boolean).join('\n').trim();
    if (!composedText) {
      showToast(tr('โน้ตที่เลือกไม่มีข้อความ', 'Selected note is empty'), 'error');
      return;
    }
    appendToEditorNoteMessage(composedText);
    showToast(tr('เพิ่มข้อความจากโน้ตลงหมายเหตุแล้ว', 'Added note text to document note'));
    setNotesImportOpen(false);
  }

  function triggerLineOcrPicker() {
    lineOcrInputRef.current?.click();
  }

  function applyOcrPreviewToLineItems(mode: 'replace' | 'append' | 'append_note') {
    const sourceText = lineOcrPreviewText.trim();
    if (!sourceText) return;

    if (mode === 'append_note') {
      appendToEditorNoteMessage(sourceText);
      setLineOcrPreviewOpen(false);
      setLineOcrPreviewText('');
      showToast(tr('เพิ่มข้อความที่สแกนลงหมายเหตุแล้ว', 'Added scanned text to note'));
      return;
    }

    const importedLines = toEditorLinesFromText(sourceText);
    if (importedLines.length === 0) {
      showToast(tr('ไม่พบรายการจากข้อความที่สแกน', 'No importable line items found in scanned text'), 'error');
      return;
    }

    if (mode === 'replace') {
      replaceEditorLines(importedLines);
    } else {
      appendEditorLines(importedLines);
    }
    setLineOcrPreviewOpen(false);
    setLineOcrPreviewText('');
    showToast(tr('เพิ่มรายการจากข้อความที่สแกนแล้ว', 'Added scanned text to line items'));
  }

  async function handleLineOcrInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    setLineOcrRunning(true);
    setLineOcrProgress(0);
    try {
      const selectedLanguage = lineOcrLanguage === 'tha' ? 'tha' : lineOcrLanguage === 'eng' ? 'eng' : 'tha+eng';
      const extracted = await recognizeImageWithOcr({
        file: file,
        language: selectedLanguage,
        onProgress: (progress) => {
          setLineOcrProgress(progress);
        },
      });
      if (!extracted) {
        showToast(tr('ไม่พบข้อความในรูปภาพ', 'No text found in image'), 'error');
        return;
      }
      setLineOcrPreviewText(extracted);
      setLineOcrPreviewOpen(true);
      showToast(tr('สแกนสำเร็จ กรุณาตรวจสอบก่อนเพิ่มข้อมูล', 'Scan complete. Review before insert.'));
    } catch {
      showToast(tr('สแกนรูปภาพไม่สำเร็จ กรุณาลองใหม่', 'Image scan failed. Please retry.'), 'error');
    } finally {
      setLineOcrRunning(false);
      setLineOcrProgress(0);
    }
  }

  async function saveDocument() {
    const sellerName = normalizeText(editorDraft.sellerName, 140);
    const buyerName = normalizeText(editorDraft.buyerName, 140);
    if (!sellerName || !buyerName) {
      showToast(tr('กรุณากรอกชื่อผู้ขายและชื่อลูกค้า', 'Please enter seller and buyer names'), 'error');
      return;
    }

    const normalizedLines = editorDraft.lines
      .map((line) => ({
        description: normalizeText(line.description, 240),
        qty: Math.max(0, line.qty),
        unitPrice: Math.max(0, line.unitPrice),
      }))
      .filter((line) => line.description);
    if (normalizedLines.length === 0) {
      showToast(tr('กรุณาเพิ่มรายการสินค้า/บริการอย่างน้อย 1 รายการ', 'Please add at least one item'), 'error');
      return;
    }

    setPendingAction('save');
    setSaveFeedback('saving');
    try {
      const payload = {
        docKind: editorDraft.docKind,
        template: editorDraft.template,
        documentNo: editorDraft.documentNo,
        referenceNo: editorDraft.referenceNo,
        issueDate: editorDraft.issueDate,
        dueDate: editorDraft.dueDate || null,
        sellerName: sellerName,
        sellerAddress: editorDraft.sellerAddress,
        sellerTaxId: editorDraft.sellerTaxId,
        buyerName: buyerName,
        buyerAddress: editorDraft.buyerAddress,
        buyerTaxId: editorDraft.buyerTaxId,
        contactName: editorDraft.contactName,
        contactPhone: editorDraft.contactPhone,
        paymentMethod: editorDraft.paymentMethod,
        noteMessage: editorDraft.noteMessage,
        discountPercent: editorDraft.discountPercent,
        vatPercent: editorDraft.vatPercent,
        currency: editorDraft.currency,
        emailTo: editorDraft.emailTo,
        emailMessage: editorDraft.emailMessage,
        lines: normalizedLines,
      };

      const endpoint = editingDocumentId
        ? '/api/billing/documents/' + encodeURIComponent(editingDocumentId)
        : '/api/billing/documents';
      const method = editingDocumentId ? 'PATCH' : 'POST';

      const response = await fetchWithSessionRetry(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((body as { error?: string }).error || tr('บันทึกเอกสารไม่สำเร็จ', 'Failed to save document')));
      }

      const document = (body as { document?: BillingDocumentRecord }).document;
      if (!document?.id) {
        throw new Error(tr('ไม่พบข้อมูลเอกสารหลังบันทึก', 'Document not found after save'));
      }

      setDocuments((prev) => [document, ...prev.filter((item) => item.id !== document.id)]);
      setEditorOpen(false);
      setEditingDocumentId(null);
      setSaveFeedback('success');
      showToast(tr('บันทึกเอกสารแล้ว', 'Document saved'));
      openDetailModal(document);
    } catch (error) {
      setSaveFeedback(null);
      showToast(error instanceof Error ? error.message : tr('บันทึกเอกสารไม่สำเร็จ', 'Failed to save document'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteDocument(documentId: string, options?: { silent?: boolean }) {
    if (!options?.silent) {
      const ok = window.confirm(tr('ยืนยันลบเอกสารรายการนี้?', 'Confirm deleting this document?'));
      if (!ok) return;
    }

    setPendingAction('delete');
    try {
      const response = await fetchWithSessionRetry('/api/billing/documents/' + encodeURIComponent(documentId), {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((body as { error?: string }).error || tr('ลบเอกสารไม่สำเร็จ', 'Failed to delete document')));
      }

      setDocuments((prev) => prev.filter((item) => item.id !== documentId));
      setEmailQueue((prev) => prev.filter((item) => item.documentId !== documentId));
      if (detailDocumentId === documentId) {
        closeDetailModal();
      }
      if (!options?.silent) {
        showToast(tr('ลบเอกสารแล้ว', 'Document deleted'));
      }
    } catch (error) {
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : tr('ลบเอกสารไม่สำเร็จ', 'Failed to delete document'), 'error');
      }
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteAllDocuments() {
    if (documents.length === 0) return;
    const ok = window.confirm(tr('ยืนยันลบเอกสารทั้งหมด?', 'Confirm deleting all documents?'));
    if (!ok) return;

    setPendingAction('delete_all');
    try {
      const response = await fetchWithSessionRetry('/api/billing/documents', { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((body as { error?: string }).error || tr('ลบเอกสารทั้งหมดไม่สำเร็จ', 'Failed to delete all documents')));
      }

      setDocuments([]);
      setEmailQueue((prev) => prev.filter((item) => !documents.some((doc) => doc.id === item.documentId)));
      setDocumentsPage(1);
      closeDetailModal();
      showToast(tr('ลบเอกสารทั้งหมดแล้ว', 'All documents deleted'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('ลบเอกสารทั้งหมดไม่สำเร็จ', 'Failed to delete all documents'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function scheduleEmail(documentId: string, toEmail: string, scheduleLocal: string, message: string) {
    const safeTo = normalizeText(toEmail, 220).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTo)) {
      showToast(tr('กรุณากรอกอีเมลลูกค้าให้ถูกต้อง', 'Please enter a valid customer email'), 'error');
      return;
    }
    const scheduleIso = fromLocalDateTimeInputValue(scheduleLocal);
    if (!scheduleIso) {
      showToast(tr('กรุณาเลือกวันเวลาในการส่งอีเมล', 'Please select date/time for scheduling'), 'error');
      return;
    }

    setPendingAction('queue');
    try {
      const response = await fetchWithSessionRetry('/api/billing/email-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          toEmail: safeTo,
          scheduledAt: scheduleIso,
          message,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((body as { error?: string }).error || tr('ตั้งเวลาส่งอีเมลไม่สำเร็จ', 'Failed to schedule email')));
      }

      const job = (body as { job?: BillingEmailQueueRecord }).job;
      if (job) {
        setEmailQueue((prev) => [job, ...prev]);
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? { ...doc, emailTo: safeTo, emailMessage: message } : doc)));
      showToast(tr('ตั้งเวลาส่งอีเมลแล้ว', 'Email scheduled'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('ตั้งเวลาส่งอีเมลไม่สำเร็จ', 'Failed to schedule email'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function sendEmailNow(documentId: string, toEmail: string, message: string) {
    const safeTo = normalizeText(toEmail, 220).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTo)) {
      showToast(tr('กรุณากรอกอีเมลลูกค้าให้ถูกต้อง', 'Please enter a valid customer email'), 'error');
      return;
    }

    setPendingAction('send');
    try {
      const response = await fetchWithSessionRetry('/api/billing/email-queue/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          toEmail: safeTo,
          message,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((body as { error?: string }).error || tr('ส่งอีเมลทันทีไม่สำเร็จ', 'Failed to send email now')));
      }

      const job = (body as { job?: BillingEmailQueueRecord }).job;
      if (job) {
        setEmailQueue((prev) => [job, ...prev]);
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? { ...doc, emailTo: safeTo, emailMessage: message } : doc)));
      showToast(tr('ส่งอีเมลแล้ว', 'Email sent'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('ส่งอีเมลไม่สำเร็จ', 'Failed to send email'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  function getTypeBadgeClass(kind: BillingDocKind) {
    if (kind === 'receipt') {
      return 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white';
    }
    return 'bg-gradient-to-r from-amber-500 to-rose-500 text-white';
  }

  const previewUrl = previewDocumentId
    ? '/api/billing/documents/' +
      encodeURIComponent(previewDocumentId) +
      '/export?template=' +
      encodeURIComponent(previewTemplate) +
      '&locale=' +
      encodeURIComponent(locale === 'th' ? 'th-TH' : 'en-US')
    : '';

  return (
    <section className='space-y-3 pb-20 pt-[max(10px,env(safe-area-inset-top))]'>
      <Card className='space-y-3 rounded-2xl border-slate-200 bg-white p-4'>
        <div className='flex items-start gap-3'>
          <div className='inline-flex rounded-xl bg-blue-50 p-2 text-blue-600'>
            <ReceiptText className='h-5 w-5' />
          </div>
          <div className='min-w-0'>
            <h1 className='text-app-h2 font-semibold text-slate-900'>{tr('ออกใบเสร็จ/แจ้งหนี้', 'Billing Documents')}</h1>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <Button type='button' className='h-10 w-full justify-center gap-2' onClick={openCreateDocumentModal}>
            <Plus className='h-4 w-4' />
            {tr('สร้างเอกสารใหม่', 'Create Document')}
          </Button>
          <Button type='button' variant='secondary' className='h-10 w-full justify-center gap-2' onClick={() => loadBillingData().catch(() => undefined)} disabled={loading}>
            <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
            {tr('รีเฟรชข้อมูล', 'Refresh')}
          </Button>
        </div>
      </Card>

      <div className='grid grid-cols-2 gap-2'>
        <button
          type='button'
          onClick={() => setActiveTab('queue')}
          className={
            'rounded-2xl border px-3 py-3 text-left transition ' +
            (activeTab === 'queue'
              ? 'border-blue-300 bg-blue-50 text-blue-900'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
          }
        >
          <p className='inline-flex items-center gap-1.5 text-app-body font-semibold'>
            <Mail className='h-4 w-4' />
            {tr('คิวส่งอีเมล', 'Email Queue')} ({emailQueue.length})
          </p>
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('documents')}
          className={
            'rounded-2xl border px-3 py-3 text-left transition ' +
            (activeTab === 'documents'
              ? 'border-blue-300 bg-blue-50 text-blue-900'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
          }
        >
          <p className='inline-flex items-center gap-1.5 text-app-body font-semibold'>
            <FileText className='h-4 w-4' />
            {tr('เอกสารที่บันทึกไว้', 'Saved Documents')} ({documents.length})
          </p>
        </button>
      </div>

      {activeTab === 'documents' ? (
        <Card className='space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
          {documents.length > 0 ? (
            <div className='flex items-center justify-between gap-2'>
              <p className='text-app-caption font-semibold text-slate-500'>{tr('จัดการเอกสารที่บันทึกไว้', 'Manage saved documents')}</p>
              <Button type='button' variant='secondary' size='sm' className='h-8 px-2.5 text-app-caption' onClick={deleteAllDocuments} disabled={deletingInProgress || loading}>
                <Trash2 className='h-3.5 w-3.5' />
                {tr('ลบทั้งหมด', 'Delete all')}
              </Button>
            </div>
          ) : null}
          {loading ? (
            <p className='text-app-body text-slate-500'>{tr('กำลังโหลดรายการ...', 'Loading documents...')}</p>
          ) : documents.length === 0 ? (
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center'>
              <p className='text-app-body font-semibold text-slate-900'>{tr('ยังไม่มีเอกสารที่บันทึก', 'No saved documents yet')}</p>
              <p className='text-app-caption text-slate-500'>{tr('กดปุ่มสร้างเอกสารใหม่เพื่อเริ่มใช้งาน', 'Tap create document to get started')}</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {pagedDocuments.map((document) => (
                <div key={document.id} className='rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3'>
                  <button
                    type='button'
                    onClick={() => openDetailModal(document)}
                    className='w-full text-left transition hover:opacity-95'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-1.5'>
                        <span className={'rounded-full px-2 py-1 text-app-micro font-semibold ' + getTypeBadgeClass(document.docKind)}>
                          {document.docKind === 'receipt' ? tr('ใบเสร็จ', 'Receipt') : tr('ใบแจ้งหนี้', 'Invoice')}
                        </span>
                        <span className='rounded-full bg-slate-200 px-2 py-1 text-app-micro font-semibold text-slate-700'>
                          {document.template.toUpperCase()}
                        </span>
                      </div>
                      <span className='text-app-micro text-slate-500'>{formatDateTimeDisplay(document.createdAt, locale)}</span>
                    </div>
                    <p className='mt-2 text-app-body font-semibold text-slate-900'>{document.documentNo}</p>
                    <p className='text-app-caption text-slate-600'>{document.buyerName || '-'}</p>
                    <div className='mt-2 flex items-center justify-between text-app-caption text-slate-500'>
                      <span>{tr('คิวอีเมล', 'Email queue')} {queueCountByDocument.get(document.id) ?? 0} {tr('รายการ', 'items')}</span>
                    </div>
                  </button>
                  <div className='mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                    <Button type='button' size='sm' variant='secondary' className='h-8 gap-1 text-app-caption' onClick={() => openDetailModal(document)}>
                      <Eye className='h-3.5 w-3.5' />
                      {tr('เปิดรายละเอียด', 'Open details')}
                    </Button>
                    <Button type='button' size='sm' variant='secondary' className='h-8 gap-1 text-app-caption' onClick={() => openEditDocumentModal(document)}>
                      <PenSquare className='h-3.5 w-3.5' />
                      {tr('แก้ไข', 'Edit')}
                    </Button>
                    <Button type='button' size='sm' variant='secondary' className='h-8 gap-1 text-app-caption' onClick={() => openPreview(document.id, document.template)}>
                      <FileText className='h-3.5 w-3.5' />
                      {tr('วิวใบเสร็จ', 'Receipt view')}
                    </Button>
                    <Button type='button' size='sm' className='h-8 gap-1 text-app-caption' onClick={() => deleteDocument(document.id)} disabled={deletingInProgress}>
                      <Trash2 className='h-3.5 w-3.5' />
                      {tr('ลบ', 'Delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {documents.length > DOCUMENTS_PER_PAGE ? (
            <div className='flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2'>
              <Button type='button' variant='secondary' size='sm' className='h-8 px-2' onClick={() => setDocumentsPage((prev) => Math.max(1, prev - 1))} disabled={documentsPage === 1}>
                <ChevronLeft className='h-3.5 w-3.5' />
                {tr('ก่อนหน้า', 'Prev')}
              </Button>
              <p className='text-app-caption font-semibold text-slate-600'>
                {tr('หน้า', 'Page')} {documentsPage} / {totalDocumentPages}
              </p>
              <Button type='button' variant='secondary' size='sm' className='h-8 px-2' onClick={() => setDocumentsPage((prev) => Math.min(totalDocumentPages, prev + 1))} disabled={documentsPage === totalDocumentPages}>
                {tr('ถัดไป', 'Next')}
                <ChevronRight className='h-3.5 w-3.5' />
              </Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className='space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
          {loading ? (
            <p className='text-app-body text-slate-500'>{tr('กำลังโหลดคิว...', 'Loading queue...')}</p>
          ) : emailQueue.length === 0 ? (
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center'>
              <Inbox className='mx-auto mb-2 h-5 w-5 text-slate-400' />
              <p className='text-app-body font-semibold text-slate-900'>{tr('ยังไม่มีคิวอีเมล', 'No email queue yet')}</p>
              <p className='text-app-caption text-slate-500'>{tr('เข้าเอกสารแต่ละรายการเพื่อตั้งเวลาส่งอีเมลได้ทันที', 'Open a document to schedule email delivery')}</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {pagedEmailQueue.map((item) => {
                const linkedDoc = documents.find((doc) => doc.id === item.documentId);
                return (
                  <div key={item.id} className='rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-app-body font-semibold text-slate-900'>{linkedDoc?.documentNo || item.documentId}</p>
                      <span className={'rounded-full px-2 py-1 text-app-micro font-semibold ' + getQueueStatusBadgeClass(item.status)}>
                        {getQueueStatusLabel(item.status, locale)}
                      </span>
                    </div>
                    <p className='mt-1 text-app-caption text-slate-600'>{tr('ถึง', 'To')}: {item.toEmail}</p>
                    <p className='text-app-caption text-slate-600'>{tr('เวลาส่ง', 'Scheduled at')}: {formatDateTimeDisplay(item.scheduledAt, locale)}</p>
                    {item.sentAt ? <p className='text-app-caption text-emerald-700'>{tr('ส่งสำเร็จ', 'Sent')}: {formatDateTimeDisplay(item.sentAt, locale)}</p> : null}
                    {item.lastError ? (
                      <p className='mt-1 inline-flex items-center gap-1 text-app-caption text-rose-700'>
                        <AlertCircle className='h-3.5 w-3.5' />
                        {formatQueueError(item.lastError, locale)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {emailQueue.length > EMAIL_QUEUE_PER_PAGE ? (
            <div className='flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2'>
              <Button type='button' variant='secondary' size='sm' className='h-8 px-2' onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))} disabled={queuePage === 1}>
                <ChevronLeft className='h-3.5 w-3.5' />
                {tr('ก่อนหน้า', 'Prev')}
              </Button>
              <p className='text-app-caption font-semibold text-slate-600'>
                {tr('หน้า', 'Page')} {queuePage} / {totalQueuePages}
              </p>
              <Button type='button' variant='secondary' size='sm' className='h-8 px-2' onClick={() => setQueuePage((prev) => Math.min(totalQueuePages, prev + 1))} disabled={queuePage === totalQueuePages}>
                {tr('ถัดไป', 'Next')}
                <ChevronRight className='h-3.5 w-3.5' />
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {creatorStage ? (
        <div className='fixed inset-0 z-[82] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]'>
          <div className='w-full max-w-[380px] animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-app-caption font-semibold uppercase tracking-[0.12em] text-slate-500'>
                  {creatorStage === 'kind' ? tr('เลือกประเภทเอกสาร', 'Choose document type') : tr('เลือกขนาดเอกสาร', 'Choose paper size')}
                </p>
                <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>
                  {creatorStage === 'kind' ? tr('ต้องการสร้างเอกสารแบบไหน?', 'Which document do you want?') : tr('ต้องการพิมพ์ขนาดไหน?', 'Which print size do you need?')}
                </h3>
              </div>
              <button type='button' onClick={() => setCreatorStage(null)} className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'>
                <X className='h-5 w-5' />
              </button>
            </div>
            {creatorStage === 'kind' ? (
              <div className='mt-4 grid grid-cols-2 gap-2'>
                <Button type='button' className='h-12' onClick={() => selectCreateKind('receipt')}>
                  {tr('ใบเสร็จ', 'Receipt')}
                </Button>
                <Button type='button' variant='secondary' className='h-12' onClick={() => selectCreateKind('invoice')}>
                  {tr('ใบแจ้งหนี้', 'Invoice')}
                </Button>
              </div>
            ) : (
              <div className='mt-4 grid grid-cols-2 gap-2'>
                <Button type='button' className='h-12' onClick={() => selectCreateTemplate('a4')}>
                  A4
                </Button>
                <Button type='button' variant='secondary' className='h-12' onClick={() => selectCreateTemplate('80mm')}>
                  80 mm
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className='fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[1px] animate-overlay-in'>
          <div className='app-shell mx-auto flex h-full w-full max-w-[460px] flex-col bg-[var(--background)] animate-screen-in'>
            <div className='sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-sm'>
              <div>
                <h2 className='text-app-h3 font-semibold text-slate-900'>{editingDocumentId ? tr('แก้ไขเอกสาร', 'Edit document') : tr('สร้างเอกสารใหม่', 'Create document')}</h2>
                <p className='text-app-caption text-slate-500'>
                  {editorStep === 'document'
                    ? tr('ขั้นตอนที่ 1: ข้อมูลเอกสาร', 'Step 1: Document info')
                    : editorStep === 'parties'
                      ? tr('ขั้นตอนที่ 2: ผู้ขายและลูกค้า', 'Step 2: Seller and customer')
                      : editorStep === 'items'
                        ? tr('ขั้นตอนที่ 3: รายการสินค้า/บริการ', 'Step 3: Items')
                        : tr('สรุปยอดและบันทึกเอกสาร', 'Summary and save')}
                </p>
              </div>
              <Button type='button' variant='secondary' size='sm' className='h-10 w-10 rounded-xl px-0' onClick={closeEditor}>
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='flex-1 overflow-y-auto px-4 pb-32 pt-4'>
              <div className='space-y-3'>
                <div className='hidden'>
                  <Button
                    type='button'
                    size='sm'
                    variant={editorDraft.docKind === 'receipt' ? 'default' : 'secondary'}
                    onClick={() => {
                      updateEditorDraft('docKind', 'receipt');
                      if (!editorDraft.documentNo.startsWith('RE')) updateEditorDraft('documentNo', createDocumentNo('RE'));
                    }}
                  >
                    {tr('ใบเสร็จ', 'Receipt')}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant={editorDraft.docKind === 'invoice' ? 'default' : 'secondary'}
                    onClick={() => {
                      updateEditorDraft('docKind', 'invoice');
                      if (!editorDraft.documentNo.startsWith('INV')) updateEditorDraft('documentNo', createDocumentNo('INV'));
                    }}
                  >
                    {tr('ใบแจ้งหนี้', 'Invoice')}
                  </Button>
                  <Button type='button' size='sm' variant={editorDraft.template === 'a4' ? 'default' : 'secondary'} onClick={() => updateEditorDraft('template', 'a4')}>
                    A4
                  </Button>
                  <Button type='button' size='sm' variant={editorDraft.template === '80mm' ? 'default' : 'secondary'} onClick={() => updateEditorDraft('template', '80mm')}>
                    80mm
                  </Button>
                </div>

                <div className={(editorStep === 'document' ? 'space-y-2.5' : 'hidden') + ' rounded-2xl border border-slate-200 bg-slate-50/80 p-3'}>
                  <p className='form-label uppercase tracking-[0.08em] text-slate-500'>{tr('ข้อมูลเอกสาร', 'Document info')}</p>
                  <Input value={editorDraft.documentNo} readOnly placeholder='รหัสออกบิล (อัตโนมัติ)' className='bg-slate-100 font-mono text-slate-700' />
                  <Input type='date' value={editorDraft.issueDate} onChange={(event) => updateEditorDraft('issueDate', event.target.value)} />
                </div>

                <div className={(editorStep === 'parties' ? 'space-y-2.5' : 'hidden') + ' rounded-2xl border border-slate-200 bg-slate-50/80 p-3'}>
                  <p className='form-label uppercase tracking-[0.08em] text-slate-500'>{tr('ผู้ขายและลูกค้า', 'Seller & buyer')}</p>
                  <Input value={editorDraft.buyerName} onChange={(event) => updateEditorDraft('buyerName', event.target.value)} placeholder='ชื่อลูกค้า' />
                  <Input value={editorDraft.contactPhone} onChange={(event) => updateEditorDraft('contactPhone', event.target.value)} placeholder='เบอร์ติดต่อลูกค้า' />
                  <Input value={editorDraft.sellerName} onChange={(event) => updateEditorDraft('sellerName', event.target.value)} placeholder='ชื่อผู้ขาย' />
                  <Input value={editorDraft.sellerTaxId} onChange={(event) => updateEditorDraft('sellerTaxId', event.target.value)} placeholder='เบอร์ติดต่อผู้ขาย' />
                </div>
                <div className={(editorStep === 'items' ? '' : 'hidden') + ' rounded-2xl border border-slate-200 bg-slate-50/80 p-3'}>
                  <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                    <p className='text-app-body font-semibold text-slate-900'>{tr('รายการสินค้า/บริการ', 'Items')}</p>
                    <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={addEditorLine}>
                      <Plus className='h-3.5 w-3.5' />
                      {tr('เพิ่มรายการ', 'Add item')}
                    </Button>
                  </div>
                  <div className='mb-2 flex flex-wrap items-center gap-2'>
                    <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={openNotesImportModal}>
                      <Search className='h-3.5 w-3.5' />
                      {tr('ดึงจากโน้ต', 'Import from notes')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='secondary'
                      className='gap-1'
                      onClick={triggerLineOcrPicker}
                      disabled={lineOcrRunning || pendingAction === 'save'}
                    >
                      {lineOcrRunning ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <ImageUp className='h-3.5 w-3.5' />}
                      {tr('สแกนข้อความ', 'Scan text')}
                    </Button>
                  </div>
                  <input ref={lineOcrInputRef} type='file' accept='image/*' capture='environment' className='hidden' onChange={handleLineOcrInput} />
                  {lineOcrRunning ? (
                    <div className='mb-2 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2'>
                      <p className='flex items-center gap-1 text-app-micro font-semibold text-sky-700'>
                        <Sparkles className='h-3.5 w-3.5' />
                        {tr('กำลังสแกนข้อความจากภาพ...', 'Scanning text from image...')}
                      </p>
                      <div className='mt-2 h-1.5 w-full rounded-full bg-sky-100'>
                        <div className='h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300' style={{ width: Math.max(6, Math.round(lineOcrProgress * 100)) + '%' }} />
                      </div>
                    </div>
                  ) : null}
                  <p className='mb-2 text-app-micro leading-5 text-slate-500'>{tr('สามารถดึงข้อมูลจากเมนูโน้ต หรือใช้ OCR สแกนเอกสารเพื่อเติมรายการได้อัตโนมัติ', 'Import from notes or scan document text with OCR to auto-fill line items')}</p>
                  <div className='space-y-2'>
                    {editorDraft.lines.map((line, index) => (
                      <div key={String(index)} className='rounded-xl border border-slate-200 bg-white/90 p-2 sm:grid sm:grid-cols-[1fr_64px_84px_auto] sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0'>
                        <Input value={line.description} onChange={(event) => updateEditorLine(index, { description: event.target.value })} placeholder={'รายการ #' + (index + 1)} />
                        <Input type='number' min={0} step='1' value={String(line.qty)} onChange={(event) => updateEditorLine(index, { qty: parseNumberInput(event.target.value) })} placeholder='Qty' />
                        <Input type='number' min={0} step='0.01' value={String(line.unitPrice)} onChange={(event) => updateEditorLine(index, { unitPrice: parseNumberInput(event.target.value) })} placeholder='ราคา' />
                        <Button type='button' size='sm' variant='secondary' className='h-10 w-10 px-0 sm:h-11' onClick={() => removeEditorLine(index)}>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='hidden'>
                  <p className='text-app-micro font-semibold uppercase tracking-[0.08em] text-slate-500'>{tr('สรุปยอดและการส่งเอกสาร', 'Totals and delivery')}</p>
                  <div className='grid grid-cols-2 gap-2'>
                    <Input type='number' min={0} step='0.01' value={String(editorDraft.discountPercent)} onChange={(event) => updateEditorDraft('discountPercent', parseNumberInput(event.target.value))} placeholder='ส่วนลด %' />
                    <Input type='number' min={0} step='0.01' value={String(editorDraft.vatPercent)} onChange={(event) => updateEditorDraft('vatPercent', parseNumberInput(event.target.value))} placeholder='VAT %' />
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Input value={editorDraft.currency} onChange={(event) => updateEditorDraft('currency', event.target.value)} placeholder='Currency' />
                    <Input value={editorDraft.paymentMethod} onChange={(event) => updateEditorDraft('paymentMethod', event.target.value)} placeholder='วิธีชำระเงิน' />
                  </div>
                  <textarea
                    value={editorDraft.noteMessage}
                    onChange={(event) => updateEditorDraft('noteMessage', event.target.value)}
                    className='min-h-16 w-full rounded-2xl border border-[var(--border-soft)] bg-slate-50/80 px-4 py-3 text-app-body text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                    placeholder='หมายเหตุ'
                  />
                  <Input type='email' value={editorDraft.emailTo} onChange={(event) => updateEditorDraft('emailTo', event.target.value)} placeholder='อีเมลลูกค้า / ผู้รับเอกสาร' />
                  <textarea
                    value={editorDraft.emailMessage}
                    onChange={(event) => updateEditorDraft('emailMessage', event.target.value)}
                    className='min-h-16 w-full rounded-2xl border border-[var(--border-soft)] bg-slate-50/80 px-4 py-3 text-app-body text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                    placeholder='ข้อความในอีเมลที่ต้องการส่งถึงลูกค้า'
                  />
                </div>
                <Card className='hidden'>
                  <p className='text-app-body font-semibold text-slate-900'>{tr('สรุปยอด', 'Summary')}</p>
                  <div className='text-app-body text-slate-700'>
                    <p>Subtotal: {formatCurrency(editorTotals.subtotal)} {editorDraft.currency}</p>
                    <p>Discount: -{formatCurrency(editorTotals.discountAmount)} {editorDraft.currency}</p>
                    <p>VAT: {formatCurrency(editorTotals.vatAmount)} {editorDraft.currency}</p>
                    <p className='font-semibold text-slate-900'>Grand Total: {formatCurrency(editorTotals.grandTotal)} {editorDraft.currency}</p>
                  </div>
                </Card>
              </div>
            </div>

            <div className='absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-sm'>
              <div className='mx-auto flex w-full max-w-[460px] gap-2'>
                <Button type='button' variant='secondary' className='flex-1' onClick={editorStep === 'document' ? closeEditor : goPrevEditorStep}>
                  {editorStep === 'document' ? tr('ยกเลิก', 'Cancel') : tr('ย้อนกลับ', 'Back')}
                </Button>
                <Button type='button' className='flex-1 gap-2' onClick={goNextEditorStep}>
                  {editorStep === 'items' ? <FileText className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                  {editorStep === 'items' ? tr('สรุปยอด', 'Summary') : tr('ถัดไป', 'Next')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen && editorStep === 'summary' ? (
        <div className='fixed inset-0 z-[86] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]'>
          <div className='w-full max-w-[420px] animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='form-label uppercase tracking-[0.12em] text-slate-500'>{tr('สรุปยอด', 'Summary')}</p>
                <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>{editorDraft.documentNo}</h3>
              </div>
              <button type='button' onClick={() => setEditorStep('items')} className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'>
                <X className='h-5 w-5' />
              </button>
            </div>

            <div className='mt-4 space-y-3'>
              <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3 text-app-body text-slate-700'>
                <div className='flex justify-between gap-3'>
                  <span>{tr('ยอดรวม', 'Subtotal')}</span>
                  <span className='font-semibold'>{formatCurrency(editorTotals.subtotal)} {editorDraft.currency}</span>
                </div>
                <div className='mt-2 flex justify-between gap-3'>
                  <span>{tr('ภาษี', 'VAT')} {editorDraft.vatPercent}%</span>
                  <span className='font-semibold'>{formatCurrency(editorTotals.vatAmount)} {editorDraft.currency}</span>
                </div>
                <div className='mt-3 flex justify-between gap-3 border-t border-slate-200 pt-3 text-app-h3 text-slate-950'>
                  <span className='font-semibold'>{tr('ยอดชำระสุทธิ์', 'Net payment')}</span>
                  <span className='font-bold'>{formatCurrency(editorTotals.grandTotal)} {editorDraft.currency}</span>
                </div>
              </div>
              <Input type='number' min={0} max={100} step='0.01' value={String(editorDraft.vatPercent)} onChange={(event) => updateEditorDraft('vatPercent', parseNumberInput(event.target.value))} placeholder='ภาษี %' />
              <Input type='email' value={editorDraft.emailTo} onChange={(event) => updateEditorDraft('emailTo', event.target.value)} placeholder='อีเมล์ลูกค้าผู้ได้รับ' />
            </div>

            <div className='mt-4 grid grid-cols-2 gap-2'>
              <Button type='button' variant='secondary' onClick={closeEditor}>
                {tr('ยกเลิก', 'Cancel')}
              </Button>
              <Button type='button' className='gap-2' onClick={saveDocument} disabled={pendingAction === 'save'}>
                {pendingAction === 'save' ? <Loader2 className='h-4 w-4 animate-spin' /> : <FileText className='h-4 w-4' />}
                {pendingAction === 'save' ? tr('กำลังบันทึก...', 'Saving...') : tr('บันทึกเอกสาร', 'Save document')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {saveFeedback ? (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]'>
          <div className='w-full max-w-[320px] rounded-[22px] border border-slate-200 bg-white p-4 text-center shadow-2xl'>
            {saveFeedback === 'saving' ? <Loader2 className='mx-auto h-8 w-8 animate-spin text-blue-600' /> : <FileText className='mx-auto h-8 w-8 text-emerald-600' />}
            <p className='mt-3 text-app-h3 font-semibold text-slate-900'>
              {saveFeedback === 'saving' ? tr('กำลังบันทึก', 'Saving') : tr('บันทึกสำเร็จ', 'Saved successfully')}
            </p>
            {saveFeedback === 'success' ? (
              <Button type='button' className='mt-4 w-full' onClick={() => setSaveFeedback(null)}>
                {tr('ตกลง', 'OK')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {notesImportOpen ? (
        <div className='fixed inset-0 z-[83] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px]'>
          <div className='w-full max-w-[720px] animate-slide-up rounded-[26px] border border-slate-200 bg-white p-4 shadow-2xl'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-app-caption font-semibold uppercase tracking-[0.12em] text-slate-500'>{tr('ดึงจากโน้ต', 'Notes import')}</p>
                <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>{tr('เลือกข้อความจากเมนูโน้ต', 'Select text from notes')}</h3>
              </div>
              <button type='button' onClick={closeNotesImportModal} className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'>
                <X className='h-5 w-5' />
              </button>
            </div>

            <div className='mt-3 flex flex-wrap gap-2'>
              <Input
                value={notesImportQuery}
                onChange={(event) => setNotesImportQuery(event.target.value)}
                placeholder={tr('ค้นหาโน้ตจากชื่อหรือเนื้อหา', 'Search notes by title or content')}
                className='h-10 min-w-[220px] flex-1'
              />
              <Button type='button' variant='secondary' className='h-10 gap-2' onClick={() => void loadNotesImport(notesImportQuery)} disabled={notesImportLoading}>
                <RefreshCw className={'h-4 w-4 ' + (notesImportLoading ? 'animate-spin' : '')} />
                {tr('รีเฟรช', 'Refresh')}
              </Button>
            </div>

            <div className='mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1'>
              {notesImportLoading ? (
                <p className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-app-body text-slate-600'>{tr('กำลังโหลดโน้ต...', 'Loading notes...')}</p>
              ) : notesImportResults.length === 0 ? (
                <p className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-app-body text-slate-600'>{tr('ไม่พบโน้ตที่ตรงเงื่อนไข', 'No matching notes found')}</p>
              ) : (
                notesImportResults.map((note) => (
                  <div key={note.id} className='rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3'>
                    <p className='text-app-body font-semibold text-slate-900'>{note.title || tr('โน้ตไม่มีชื่อ', 'Untitled note')}</p>
                    <p className='mt-1 line-clamp-3 whitespace-pre-wrap break-words text-app-caption text-slate-600'>{note.content || '-'}</p>
                    <p className='mt-1 text-app-micro text-slate-500'>{tr('อัปเดตล่าสุด', 'Updated')}: {formatDateTimeDisplay(note.updatedAt || null, locale)}</p>
                    <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3'>
                      <Button type='button' variant='secondary' className='h-9 text-app-caption' onClick={() => importNoteAsLineItems(note, 'replace')}>
                        {tr('แทนที่รายการ', 'Replace items')}
                      </Button>
                      <Button type='button' variant='secondary' className='h-9 text-app-caption' onClick={() => importNoteAsLineItems(note, 'append')}>
                        {tr('เพิ่มรายการ', 'Append items')}
                      </Button>
                      <Button type='button' className='h-9 text-app-caption' onClick={() => importNoteToMessage(note)}>
                        {tr('เพิ่มเป็นหมายเหตุ', 'Add as note')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {lineOcrPreviewOpen ? (
        <div className='fixed inset-0 z-[84] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[3px]'>
          <div className='w-full max-w-[720px] animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl'>
            <div className='flex items-start justify-between gap-2'>
              <div>
                <p className='text-app-caption font-semibold uppercase tracking-[0.12em] text-slate-500'>{tr('พรีวิว OCR', 'OCR preview')}</p>
                <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>{tr('ตรวจสอบข้อความที่สแกนก่อนเพิ่มลงเอกสาร', 'Review scanned text before inserting')}</h3>
              </div>
              <button
                type='button'
                onClick={() => {
                  setLineOcrPreviewOpen(false);
                  setLineOcrPreviewText('');
                }}
                className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'
              >
                <X className='h-5 w-5' />
              </button>
            </div>
            <textarea
              value={lineOcrPreviewText}
              onChange={(event) => setLineOcrPreviewText(event.target.value)}
              className='mt-3 min-h-[220px] max-h-[46dvh] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-app-body leading-6 text-slate-800 outline-none focus:border-sky-300'
            />
            <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4'>
              <Button
                type='button'
                variant='secondary'
                className='w-full'
                onClick={() => {
                  setLineOcrPreviewOpen(false);
                  setLineOcrPreviewText('');
                }}
              >
                {tr('ปิด', 'Close')}
              </Button>
              <Button type='button' variant='secondary' className='w-full' onClick={() => applyOcrPreviewToLineItems('replace')}>
                {tr('แทนที่รายการ', 'Replace items')}
              </Button>
              <Button type='button' variant='secondary' className='w-full' onClick={() => applyOcrPreviewToLineItems('append')}>
                {tr('เพิ่มรายการ', 'Append items')}
              </Button>
              <Button type='button' className='w-full' onClick={() => applyOcrPreviewToLineItems('append_note')}>
                {tr('เพิ่มเป็นหมายเหตุ', 'Add as note')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDetailDocument ? (
        <div className='fixed inset-0 z-[82] bg-white animate-overlay-in'>
          <div className='app-shell mx-auto flex h-full w-full max-w-[460px] flex-col bg-[var(--background)] animate-screen-in'>
            <div className='flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3'>
              <div>
                <div className='flex items-center gap-2'>
                  <h2 className='text-app-h3 font-semibold text-slate-900'>{selectedDetailDocument.documentNo}</h2>
                  <span className={'rounded-full px-2 py-1 text-app-micro font-semibold ' + getTypeBadgeClass(selectedDetailDocument.docKind)}>
                    {selectedDetailDocument.docKind === 'receipt' ? tr('ใบเสร็จ', 'Receipt') : tr('ใบแจ้งหนี้', 'Invoice')}
                  </span>
                </div>
                <p className='text-app-caption text-slate-500'>{selectedDetailDocument.buyerName || '-'}</p>
              </div>
              <Button type='button' variant='secondary' size='sm' className='h-9 w-9 px-0' onClick={closeDetailModal}>
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='flex-1 overflow-y-auto px-4 py-3 pb-20'>
              <Card className='space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
                <div className='grid grid-cols-2 gap-2 text-app-body'>
                  <p><span className='text-slate-500'>{tr('วันที่', 'Date')}:</span> {formatDateDisplay(selectedDetailDocument.issueDate, locale)}</p>
                  <p><span className='text-slate-500'>{tr('ครบกำหนด', 'Due date')}:</span> {formatDateDisplay(selectedDetailDocument.dueDate, locale)}</p>
                  <p><span className='text-slate-500'>{tr('ลูกค้า', 'Buyer')}:</span> {selectedDetailDocument.buyerName || '-'}</p>
                  <p><span className='text-slate-500'>{tr('ยอดสุทธิ', 'Net total')}:</span> {formatCurrency(selectedDetailDocument.grandTotal)} {selectedDetailDocument.currency}</p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => openEditDocumentModal(selectedDetailDocument)}>
                    <PenSquare className='h-3.5 w-3.5' />
                    {tr('แก้ไข', 'Edit')}
                  </Button>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => openPreview(selectedDetailDocument.id, 'a4')}>
                    <Eye className='h-3.5 w-3.5' />
                    {tr('พรีวิว A4', 'Preview A4')}
                  </Button>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => openPreview(selectedDetailDocument.id, '80mm')}>
                    <Eye className='h-3.5 w-3.5' />
                    {tr('พรีวิว 80mm', 'Preview 80mm')}
                  </Button>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => window.open('/api/billing/documents/' + encodeURIComponent(selectedDetailDocument.id) + '/export?template=a4&print=1', '_blank', 'noopener,noreferrer')}>
                    <Printer className='h-3.5 w-3.5' />
                    {tr('พิมพ์', 'Print')}
                  </Button>
                </div>

                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
                  <p className='text-app-body font-semibold text-slate-900'>{tr('เนื้อหาเอกสารที่บันทึกไว้', 'Saved document content')}</p>
                  <p className='mt-1 text-app-caption text-slate-600'>
                    {tr('ผู้ขาย', 'Seller')}: {selectedDetailDocument.sellerName || '-'} | {tr('ลูกค้า', 'Buyer')}: {selectedDetailDocument.buyerName || '-'}
                  </p>
                  {selectedDetailDocument.noteMessage ? (
                    <p className='mt-1 text-app-caption text-slate-600'>{tr('หมายเหตุ', 'Note')}: {selectedDetailDocument.noteMessage}</p>
                  ) : null}
                  <div className='mt-2 space-y-1'>
                    {selectedDetailDocument.lines.length === 0 ? (
                      <p className='text-app-caption text-slate-500'>{tr('ยังไม่มีรายการสินค้า/บริการ', 'No items yet')}</p>
                    ) : (
                      selectedDetailDocument.lines.map((line, index) => (
                        <div key={selectedDetailDocument.id + '-line-' + index} className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-app-caption'>
                          <p className='font-semibold text-slate-900'>{line.description || 'รายการสินค้า/บริการ'}</p>
                          <p className='text-slate-600'>
                            จำนวน {line.qty} x {formatCurrency(line.unitPrice)} = {formatCurrency(line.qty * line.unitPrice)} {selectedDetailDocument.currency}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>

              <Card className='mt-3 space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
                <h3 className='text-app-body font-semibold text-slate-900'>ส่งอีเมลถึงลูกค้า</h3>
                <Input type='email' value={detailEmailTo} onChange={(event) => setDetailEmailTo(event.target.value)} placeholder='อีเมลลูกค้า / ผู้รับเอกสาร' />
                <Input type='datetime-local' value={detailScheduleAt} onChange={(event) => setDetailScheduleAt(event.target.value)} />
                <textarea
                  value={detailEmailMessage}
                  onChange={(event) => setDetailEmailMessage(event.target.value)}
                  className='min-h-20 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-app-body text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                  placeholder='ข้อความในอีเมลที่ต้องการส่งถึงลูกค้า'
                />
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    className='gap-2'
                    onClick={() => scheduleEmail(selectedDetailDocument.id, detailEmailTo, detailScheduleAt, detailEmailMessage)}
                    disabled={pendingAction === 'queue'}
                  >
                    <Clock3 className='h-4 w-4' />
                    {pendingAction === 'queue' ? 'กำลังตั้งคิว...' : 'ตั้งเวลาส่งอีเมล'}
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    className='gap-2'
                    onClick={() => sendEmailNow(selectedDetailDocument.id, detailEmailTo, detailEmailMessage)}
                    disabled={pendingAction === 'send'}
                  >
                    <Send className='h-4 w-4' />
                    {pendingAction === 'send' ? 'กำลังส่ง...' : 'ส่งทันที'}
                  </Button>
                </div>
              </Card>

              <Card className='mt-3 space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
                <h3 className='text-app-body font-semibold text-slate-900'>คิวส่งอีเมลของรายการนี้ ({selectedDetailQueue.length})</h3>
                {selectedDetailQueue.length === 0 ? (
                  <p className='text-app-caption text-slate-500'>ยังไม่มีคิวส่งอีเมล</p>
                ) : (
                  <div className='space-y-2'>
                    {selectedDetailQueue.map((queue) => (
                        <div key={queue.id} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-app-caption'>
                          <div className='flex items-center justify-between gap-2'>
                            <p className='font-semibold text-slate-900'>{queue.toEmail}</p>
                            <span className={'rounded-full px-2 py-1 font-semibold ' + getQueueStatusBadgeClass(queue.status)}>
                              {getQueueStatusLabel(queue.status, locale)}
                            </span>
                          </div>
                          <p className='text-slate-600'>{tr('เวลาส่ง', 'Scheduled at')}: {formatDateTimeDisplay(queue.scheduledAt, locale)}</p>
                        {queue.sentAt ? <p className='text-emerald-700'>{tr('ส่งแล้ว', 'Sent')}: {formatDateTimeDisplay(queue.sentAt, locale)}</p> : null}
                        {queue.lastError ? <p className='inline-flex items-center gap-1 text-rose-700'><AlertCircle className='h-3.5 w-3.5' />{formatQueueError(queue.lastError, locale)}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen && previewDocumentId ? (
        <div className='fixed inset-0 z-[84] bg-slate-900/45 backdrop-blur-[1px] animate-overlay-in'>
          <div className='preserve-white app-shell mx-auto flex h-full w-full max-w-[460px] flex-col bg-white animate-screen-in'>
            <div className='flex items-center justify-between border-b border-slate-200 px-3 py-2'>
              <div className='flex items-center gap-2'>
                <Button type='button' size='sm' variant={previewTemplate === 'a4' ? 'default' : 'secondary'} onClick={() => setPreviewTemplate('a4')}>
                  A4
                </Button>
                <Button type='button' size='sm' variant={previewTemplate === '80mm' ? 'default' : 'secondary'} onClick={() => setPreviewTemplate('80mm')}>
                  80mm
                </Button>
              </div>
              <Button type='button' size='sm' variant='secondary' className='h-9 w-9 px-0' onClick={closePreview}>
                <X className='h-4 w-4' />
              </Button>
            </div>
            <div className='flex-1 bg-slate-100'>
              <iframe title='Billing Preview' src={previewUrl} className='preserve-white h-full w-full border-0 bg-white' />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
