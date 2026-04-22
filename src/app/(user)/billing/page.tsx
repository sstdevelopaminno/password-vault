'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock3,
  Eye,
  FileText,
  Inbox,
  Mail,
  PenSquare,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { fetchWithSessionRetry } from '@/lib/api-client';
import { computeBillingTotals, formatCurrency, normalizeText, type BillingDocKind, type BillingLine, type BillingTemplate } from '@/lib/billing';

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

type ActiveTab = 'queue' | 'documents';
type PendingAction = null | 'save' | 'queue' | 'send';
type BillingQueueStatus = BillingEmailQueueRecord['status'];

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

function formatDateDisplay(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTimeDisplay(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', {
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

function getQueueStatusLabel(status: BillingQueueStatus) {
  if (status === 'sent') return 'ส่งแล้ว';
  if (status === 'failed') return 'ส่งไม่สำเร็จ';
  if (status === 'processing') return 'กำลังส่ง';
  if (status === 'cancelled') return 'ยกเลิก';
  return 'รอส่ง';
}

function makeDefaultDraft(): BillDraft {
  return {
    docKind: 'receipt',
    template: 'a4',
    documentNo: createDocumentNo('RE'),
    referenceNo: createDocumentNo('INV'),
    issueDate: todayLocalDate(),
    dueDate: nextWeekLocalDate(),
    sellerName: 'ร้านของฉัน',
    sellerAddress: 'ที่อยู่ร้าน / สาขา',
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
    lines: [{ description: 'รายการสินค้า/บริการ', qty: 1, unitPrice: 0 }],
  };
}

function toDraftFromDocument(document: BillingDocumentRecord): BillDraft {
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
    lines: document.lines.length > 0 ? document.lines : [{ description: 'รายการสินค้า/บริการ', qty: 1, unitPrice: 0 }],
  };
}

export default function BillingPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('documents');
  const [documents, setDocuments] = useState<BillingDocumentRecord[]>([]);
  const [emailQueue, setEmailQueue] = useState<BillingEmailQueueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<BillDraft>(() => makeDefaultDraft());

  const [detailDocumentId, setDetailDocumentId] = useState<string | null>(null);
  const [detailEmailTo, setDetailEmailTo] = useState('');
  const [detailScheduleAt, setDetailScheduleAt] = useState(localDateTimeAfter(30));
  const [detailEmailMessage, setDetailEmailMessage] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<BillingTemplate>('a4');

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

  const editorTotals = useMemo(
    () => computeBillingTotals(editorDraft.lines, editorDraft.discountPercent, editorDraft.vatPercent),
    [editorDraft.discountPercent, editorDraft.lines, editorDraft.vatPercent],
  );

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
        throw new Error(String((documentsBody as { error?: string }).error || 'โหลดรายการเอกสารไม่สำเร็จ'));
      }
      if (!queueRes.ok) {
        throw new Error(String((queueBody as { error?: string }).error || 'โหลดคิวอีเมลไม่สำเร็จ'));
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
      showToast(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadBillingData().catch(() => undefined);
  }, [loadBillingData]);

  function openCreateDocumentModal() {
    setEditingDocumentId(null);
    setEditorDraft(makeDefaultDraft());
    setEditorOpen(true);
  }

  function openEditDocumentModal(document: BillingDocumentRecord) {
    setEditingDocumentId(document.id);
    setEditorDraft(toDraftFromDocument(document));
    setEditorOpen(true);
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

  async function saveDocument() {
    const sellerName = normalizeText(editorDraft.sellerName, 140);
    const buyerName = normalizeText(editorDraft.buyerName, 140);
    if (!sellerName || !buyerName) {
      showToast('กรุณากรอกชื่อผู้ขายและชื่อลูกค้า', 'error');
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
      showToast('กรุณาเพิ่มรายการสินค้า/บริการอย่างน้อย 1 รายการ', 'error');
      return;
    }

    setPendingAction('save');
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
        throw new Error(String((body as { error?: string }).error || 'บันทึกเอกสารไม่สำเร็จ'));
      }

      const document = (body as { document?: BillingDocumentRecord }).document;
      if (!document?.id) {
        throw new Error('ไม่พบข้อมูลเอกสารหลังบันทึก');
      }

      setDocuments((prev) => [document, ...prev.filter((item) => item.id !== document.id)]);
      setEditorOpen(false);
      setEditingDocumentId(null);
      showToast('บันทึกเอกสารแล้ว');
      openDetailModal(document);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกเอกสารไม่สำเร็จ', 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function scheduleEmail(documentId: string, toEmail: string, scheduleLocal: string, message: string) {
    const safeTo = normalizeText(toEmail, 220).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTo)) {
      showToast('กรุณากรอกอีเมลลูกค้าให้ถูกต้อง', 'error');
      return;
    }
    const scheduleIso = fromLocalDateTimeInputValue(scheduleLocal);
    if (!scheduleIso) {
      showToast('กรุณาเลือกวันเวลาในการส่งอีเมล', 'error');
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
        throw new Error(String((body as { error?: string }).error || 'ตั้งเวลาส่งอีเมลไม่สำเร็จ'));
      }

      const job = (body as { job?: BillingEmailQueueRecord }).job;
      if (job) {
        setEmailQueue((prev) => [job, ...prev]);
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? { ...doc, emailTo: safeTo, emailMessage: message } : doc)));
      showToast('ตั้งเวลาส่งอีเมลแล้ว');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ตั้งเวลาส่งอีเมลไม่สำเร็จ', 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function sendEmailNow(documentId: string, toEmail: string, message: string) {
    const safeTo = normalizeText(toEmail, 220).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTo)) {
      showToast('กรุณากรอกอีเมลลูกค้าให้ถูกต้อง', 'error');
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
        throw new Error(String((body as { error?: string }).error || 'ส่งอีเมลทันทีไม่สำเร็จ'));
      }

      const job = (body as { job?: BillingEmailQueueRecord }).job;
      if (job) {
        setEmailQueue((prev) => [job, ...prev]);
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? { ...doc, emailTo: safeTo, emailMessage: message } : doc)));
      showToast('ส่งอีเมลแล้ว');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ส่งอีเมลไม่สำเร็จ', 'error');
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
      '&locale=th-TH'
    : '';

  return (
    <section className='space-y-3 pb-20 pt-[max(10px,env(safe-area-inset-top))]'>
      <Card className='space-y-3 rounded-2xl border-slate-200 bg-white p-4'>
        <div className='flex items-start gap-3'>
          <div className='inline-flex rounded-xl bg-blue-50 p-2 text-blue-600'>
            <ReceiptText className='h-5 w-5' />
          </div>
          <div className='min-w-0'>
            <h1 className='text-lg font-semibold text-slate-900'>ออกใบเสร็จ/แจ้งหนี้</h1>
            <p className='text-xs text-slate-500'>สร้างเอกสารให้ลูกค้าได้ทันที รองรับทั้งแอปเว็บและแอป Android พร้อมคิวส่งอีเมลเดียวกัน</p>
          </div>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button type='button' className='gap-2' onClick={openCreateDocumentModal}>
            <Plus className='h-4 w-4' />
            สร้างเอกสารใหม่
          </Button>
          <Button type='button' variant='secondary' className='gap-2' onClick={() => loadBillingData().catch(() => undefined)} disabled={loading}>
            <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
            รีเฟรชข้อมูล
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
          <p className='inline-flex items-center gap-1.5 text-sm font-semibold'>
            <Mail className='h-4 w-4' />
            คิวส่งอีเมล ({emailQueue.length})
          </p>
          <p className='mt-0.5 text-xs text-slate-500'>ดูรายการอีเมลที่รอส่งหรือส่งแล้ว</p>
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
          <p className='inline-flex items-center gap-1.5 text-sm font-semibold'>
            <FileText className='h-4 w-4' />
            เอกสารที่บันทึกไว้ ({documents.length})
          </p>
          <p className='mt-0.5 text-xs text-slate-500'>แตะเพื่อเปิดรายละเอียด แก้ไข หรือดูพรีวิว</p>
        </button>
      </div>

      {activeTab === 'documents' ? (
        <Card className='space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
          {loading ? (
            <p className='text-sm text-slate-500'>กำลังโหลดรายการ...</p>
          ) : documents.length === 0 ? (
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center'>
              <p className='text-sm font-semibold text-slate-900'>ยังไม่มีเอกสารที่บันทึก</p>
              <p className='text-xs text-slate-500'>กดปุ่มสร้างเอกสารใหม่เพื่อเริ่มใช้งาน</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {documents.map((document) => (
                <button
                  key={document.id}
                  type='button'
                  onClick={() => openDetailModal(document)}
                  className='w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-blue-300'
                >
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-1.5'>
                      <span className={'rounded-full px-2 py-1 text-[11px] font-semibold ' + getTypeBadgeClass(document.docKind)}>
                        {document.docKind === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้'}
                      </span>
                      <span className='rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700'>
                        {document.template.toUpperCase()}
                      </span>
                    </div>
                    <span className='text-[11px] text-slate-500'>{formatDateTimeDisplay(document.createdAt)}</span>
                  </div>
                  <p className='mt-2 text-sm font-semibold text-slate-900'>{document.documentNo}</p>
                  <p className='text-xs text-slate-600'>{document.buyerName || '-'}</p>
                  <div className='mt-2 flex items-center justify-between text-xs text-slate-500'>
                    <span>คิวอีเมล {queueCountByDocument.get(document.id) ?? 0} รายการ</span>
                    <span className='inline-flex items-center gap-1 text-blue-600'>
                      <Eye className='h-3.5 w-3.5' />
                      เปิดรายละเอียด
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card className='space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
          {loading ? (
            <p className='text-sm text-slate-500'>กำลังโหลดคิว...</p>
          ) : emailQueue.length === 0 ? (
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center'>
              <Inbox className='mx-auto mb-2 h-5 w-5 text-slate-400' />
              <p className='text-sm font-semibold text-slate-900'>ยังไม่มีคิวอีเมล</p>
              <p className='text-xs text-slate-500'>เข้าเอกสารแต่ละรายการเพื่อตั้งเวลาส่งอีเมลได้ทันที</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {emailQueue.map((item) => {
                const linkedDoc = documents.find((doc) => doc.id === item.documentId);
                return (
                  <div key={item.id} className='rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-sm font-semibold text-slate-900'>{linkedDoc?.documentNo || item.documentId}</p>
                      <span className={'rounded-full px-2 py-1 text-[11px] font-semibold ' + getQueueStatusBadgeClass(item.status)}>
                        {getQueueStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className='mt-1 text-xs text-slate-600'>ถึง: {item.toEmail}</p>
                    <p className='text-xs text-slate-600'>เวลาส่ง: {formatDateTimeDisplay(item.scheduledAt)}</p>
                    {item.sentAt ? <p className='text-xs text-emerald-700'>ส่งสำเร็จ: {formatDateTimeDisplay(item.sentAt)}</p> : null}
                    {item.lastError ? (
                      <p className='mt-1 inline-flex items-center gap-1 text-xs text-rose-700'>
                        <AlertCircle className='h-3.5 w-3.5' />
                        {item.lastError}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {editorOpen ? (
        <div className='fixed inset-0 z-[80] bg-white animate-overlay-in'>
          <div className='app-shell mx-auto flex h-full w-full max-w-[460px] flex-col bg-[var(--background)] animate-screen-in'>
            <div className='flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3'>
              <div>
                <h2 className='text-base font-semibold text-slate-900'>{editingDocumentId ? 'แก้ไขเอกสาร' : 'สร้างเอกสารใหม่'}</h2>
                <p className='text-xs text-slate-500'>ฟอร์มเดียว ครบทั้งบันทึกและส่งอีเมลลูกค้า</p>
              </div>
              <Button type='button' variant='secondary' size='sm' className='h-9 w-9 px-0' onClick={() => setEditorOpen(false)}>
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='flex-1 overflow-y-auto px-4 py-3 pb-32'>
              <div className='space-y-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    variant={editorDraft.docKind === 'receipt' ? 'default' : 'secondary'}
                    onClick={() => {
                      updateEditorDraft('docKind', 'receipt');
                      if (!editorDraft.documentNo.startsWith('RE')) updateEditorDraft('documentNo', createDocumentNo('RE'));
                    }}
                  >
                    ใบเสร็จ
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
                    ใบแจ้งหนี้
                  </Button>
                  <Button type='button' size='sm' variant={editorDraft.template === 'a4' ? 'default' : 'secondary'} onClick={() => updateEditorDraft('template', 'a4')}>
                    A4
                  </Button>
                  <Button type='button' size='sm' variant={editorDraft.template === '80mm' ? 'default' : 'secondary'} onClick={() => updateEditorDraft('template', '80mm')}>
                    80mm
                  </Button>
                </div>

                <Input value={editorDraft.documentNo} onChange={(event) => updateEditorDraft('documentNo', event.target.value)} placeholder='เลขที่เอกสาร' />
                <Input value={editorDraft.referenceNo} onChange={(event) => updateEditorDraft('referenceNo', event.target.value)} placeholder='เลขอ้างอิง' />
                <Input type='date' value={editorDraft.issueDate} onChange={(event) => updateEditorDraft('issueDate', event.target.value)} />
                <Input type='date' value={editorDraft.dueDate} onChange={(event) => updateEditorDraft('dueDate', event.target.value)} />

                <Input value={editorDraft.sellerName} onChange={(event) => updateEditorDraft('sellerName', event.target.value)} placeholder='ชื่อร้าน / ผู้ขาย' />
                <Input value={editorDraft.sellerTaxId} onChange={(event) => updateEditorDraft('sellerTaxId', event.target.value)} placeholder='Tax ID ผู้ขาย' />
                <Input value={editorDraft.buyerName} onChange={(event) => updateEditorDraft('buyerName', event.target.value)} placeholder='ชื่อลูกค้า' />
                <Input value={editorDraft.buyerTaxId} onChange={(event) => updateEditorDraft('buyerTaxId', event.target.value)} placeholder='Tax ID ลูกค้า' />
                <Input value={editorDraft.contactName} onChange={(event) => updateEditorDraft('contactName', event.target.value)} placeholder='ชื่อผู้ติดต่อ' />
                <Input value={editorDraft.contactPhone} onChange={(event) => updateEditorDraft('contactPhone', event.target.value)} placeholder='เบอร์ติดต่อ' />

                <textarea
                  value={editorDraft.sellerAddress}
                  onChange={(event) => updateEditorDraft('sellerAddress', event.target.value)}
                  className='min-h-16 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                  placeholder='ที่อยู่ร้าน / สาขา'
                />
                <textarea
                  value={editorDraft.buyerAddress}
                  onChange={(event) => updateEditorDraft('buyerAddress', event.target.value)}
                  className='min-h-16 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                  placeholder='ที่อยู่ลูกค้า'
                />

                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
                  <div className='mb-2 flex items-center justify-between'>
                    <p className='text-sm font-semibold text-slate-900'>รายการสินค้า/บริการ</p>
                    <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={addEditorLine}>
                      <Plus className='h-3.5 w-3.5' />
                      เพิ่มรายการ
                    </Button>
                  </div>
                  <div className='space-y-2'>
                    {editorDraft.lines.map((line, index) => (
                      <div key={String(index)} className='grid grid-cols-[1fr_70px_90px_auto] gap-2'>
                        <Input value={line.description} onChange={(event) => updateEditorLine(index, { description: event.target.value })} placeholder={'รายการ #' + (index + 1)} />
                        <Input type='number' min={0} step='1' value={String(line.qty)} onChange={(event) => updateEditorLine(index, { qty: parseNumberInput(event.target.value) })} placeholder='Qty' />
                        <Input type='number' min={0} step='0.01' value={String(line.unitPrice)} onChange={(event) => updateEditorLine(index, { unitPrice: parseNumberInput(event.target.value) })} placeholder='ราคา' />
                        <Button type='button' size='sm' variant='secondary' className='h-12 w-10 px-0' onClick={() => removeEditorLine(index)}>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Input type='number' min={0} step='0.01' value={String(editorDraft.discountPercent)} onChange={(event) => updateEditorDraft('discountPercent', parseNumberInput(event.target.value))} placeholder='ส่วนลด %' />
                <Input type='number' min={0} step='0.01' value={String(editorDraft.vatPercent)} onChange={(event) => updateEditorDraft('vatPercent', parseNumberInput(event.target.value))} placeholder='VAT %' />
                <Input value={editorDraft.currency} onChange={(event) => updateEditorDraft('currency', event.target.value)} placeholder='Currency' />
                <Input value={editorDraft.paymentMethod} onChange={(event) => updateEditorDraft('paymentMethod', event.target.value)} placeholder='วิธีชำระเงิน' />
                <textarea
                  value={editorDraft.noteMessage}
                  onChange={(event) => updateEditorDraft('noteMessage', event.target.value)}
                  className='min-h-16 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                  placeholder='หมายเหตุ'
                />
                <Input type='email' value={editorDraft.emailTo} onChange={(event) => updateEditorDraft('emailTo', event.target.value)} placeholder='อีเมลลูกค้า / ผู้รับเอกสาร' />
                <textarea
                  value={editorDraft.emailMessage}
                  onChange={(event) => updateEditorDraft('emailMessage', event.target.value)}
                  className='min-h-16 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
                  placeholder='ข้อความในอีเมลที่ต้องการส่งถึงลูกค้า'
                />

                <Card className='space-y-1 rounded-2xl border-slate-200 bg-white p-3'>
                  <p className='text-sm font-semibold text-slate-900'>สรุปยอด</p>
                  <div className='text-sm text-slate-700'>
                    <p>Subtotal: {formatCurrency(editorTotals.subtotal)} {editorDraft.currency}</p>
                    <p>Discount: -{formatCurrency(editorTotals.discountAmount)} {editorDraft.currency}</p>
                    <p>VAT: {formatCurrency(editorTotals.vatAmount)} {editorDraft.currency}</p>
                    <p className='font-semibold text-slate-900'>Grand Total: {formatCurrency(editorTotals.grandTotal)} {editorDraft.currency}</p>
                  </div>
                </Card>
              </div>
            </div>

            <div className='absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white px-4 py-3'>
              <div className='mx-auto flex w-full max-w-[460px] gap-2'>
                <Button type='button' className='flex-1 gap-2' onClick={saveDocument} disabled={pendingAction === 'save'}>
                  <FileText className='h-4 w-4' />
                  {pendingAction === 'save' ? 'กำลังบันทึก...' : 'บันทึกเอกสาร'}
                </Button>
                <Button type='button' variant='secondary' className='flex-1' onClick={() => setEditorOpen(false)}>
                  ยกเลิก
                </Button>
              </div>
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
                  <h2 className='text-base font-semibold text-slate-900'>{selectedDetailDocument.documentNo}</h2>
                  <span className={'rounded-full px-2 py-1 text-[11px] font-semibold ' + getTypeBadgeClass(selectedDetailDocument.docKind)}>
                    {selectedDetailDocument.docKind === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้'}
                  </span>
                </div>
                <p className='text-xs text-slate-500'>{selectedDetailDocument.buyerName || '-'}</p>
              </div>
              <Button type='button' variant='secondary' size='sm' className='h-9 w-9 px-0' onClick={closeDetailModal}>
                <X className='h-4 w-4' />
              </Button>
            </div>

            <div className='flex-1 overflow-y-auto px-4 py-3 pb-20'>
              <Card className='space-y-2 rounded-2xl border-slate-200 bg-white p-4'>
                <div className='grid grid-cols-2 gap-2 text-sm'>
                  <p><span className='text-slate-500'>วันที่:</span> {formatDateDisplay(selectedDetailDocument.issueDate)}</p>
                  <p><span className='text-slate-500'>ครบกำหนด:</span> {formatDateDisplay(selectedDetailDocument.dueDate)}</p>
                  <p><span className='text-slate-500'>ลูกค้า:</span> {selectedDetailDocument.buyerName || '-'}</p>
                  <p><span className='text-slate-500'>ยอดสุทธิ:</span> {formatCurrency(selectedDetailDocument.grandTotal)} {selectedDetailDocument.currency}</p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => openEditDocumentModal(selectedDetailDocument)}>
                    <PenSquare className='h-3.5 w-3.5' />
                    แก้ไข
                  </Button>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => openPreview(selectedDetailDocument.id, 'a4')}>
                    <Eye className='h-3.5 w-3.5' />
                    พรีวิว A4
                  </Button>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => openPreview(selectedDetailDocument.id, '80mm')}>
                    <Eye className='h-3.5 w-3.5' />
                    พรีวิว 80mm
                  </Button>
                  <Button type='button' size='sm' variant='secondary' className='gap-1' onClick={() => window.open('/api/billing/documents/' + encodeURIComponent(selectedDetailDocument.id) + '/export?template=a4&print=1', '_blank', 'noopener,noreferrer')}>
                    <Printer className='h-3.5 w-3.5' />
                    พิมพ์
                  </Button>
                </div>

                <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
                  <p className='text-sm font-semibold text-slate-900'>เนื้อหาเอกสารที่บันทึกไว้</p>
                  <p className='mt-1 text-xs text-slate-600'>
                    ผู้ขาย: {selectedDetailDocument.sellerName || '-'} | ลูกค้า: {selectedDetailDocument.buyerName || '-'}
                  </p>
                  {selectedDetailDocument.noteMessage ? (
                    <p className='mt-1 text-xs text-slate-600'>หมายเหตุ: {selectedDetailDocument.noteMessage}</p>
                  ) : null}
                  <div className='mt-2 space-y-1'>
                    {selectedDetailDocument.lines.length === 0 ? (
                      <p className='text-xs text-slate-500'>ยังไม่มีรายการสินค้า/บริการ</p>
                    ) : (
                      selectedDetailDocument.lines.map((line, index) => (
                        <div key={selectedDetailDocument.id + '-line-' + index} className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs'>
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
                <h3 className='text-sm font-semibold text-slate-900'>ส่งอีเมลถึงลูกค้า</h3>
                <Input type='email' value={detailEmailTo} onChange={(event) => setDetailEmailTo(event.target.value)} placeholder='อีเมลลูกค้า / ผู้รับเอกสาร' />
                <Input type='datetime-local' value={detailScheduleAt} onChange={(event) => setDetailScheduleAt(event.target.value)} />
                <textarea
                  value={detailEmailMessage}
                  onChange={(event) => setDetailEmailMessage(event.target.value)}
                  className='min-h-20 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--logo-blue)] focus:ring-4 focus:ring-[var(--ring)]'
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
                <h3 className='text-sm font-semibold text-slate-900'>คิวส่งอีเมลของรายการนี้ ({selectedDetailQueue.length})</h3>
                {selectedDetailQueue.length === 0 ? (
                  <p className='text-xs text-slate-500'>ยังไม่มีคิวส่งอีเมล</p>
                ) : (
                  <div className='space-y-2'>
                    {selectedDetailQueue.map((queue) => (
                        <div key={queue.id} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs'>
                          <div className='flex items-center justify-between gap-2'>
                            <p className='font-semibold text-slate-900'>{queue.toEmail}</p>
                            <span className={'rounded-full px-2 py-1 font-semibold ' + getQueueStatusBadgeClass(queue.status)}>
                              {getQueueStatusLabel(queue.status)}
                            </span>
                          </div>
                          <p className='text-slate-600'>เวลาส่ง: {formatDateTimeDisplay(queue.scheduledAt)}</p>
                        {queue.sentAt ? <p className='text-emerald-700'>ส่งแล้ว: {formatDateTimeDisplay(queue.sentAt)}</p> : null}
                        {queue.lastError ? <p className='inline-flex items-center gap-1 text-rose-700'><AlertCircle className='h-3.5 w-3.5' />{queue.lastError}</p> : null}
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
          <div className='app-shell mx-auto flex h-full w-full max-w-[460px] flex-col bg-white animate-screen-in'>
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
              <iframe title='Billing Preview' src={previewUrl} className='h-full w-full border-0 bg-white' />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
