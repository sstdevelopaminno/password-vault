'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, Send, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

type TipStatus = 'pending_review' | 'reviewing' | 'approved_notify' | 'closed' | 'unknown';

type TipItem = {
  id: string;
  number: string;
  clueText: string;
  riskLevel: string;
  workflowStatus: TipStatus;
  createdAt: string;
};

type TipsPayload = {
  tips: TipItem[];
  summary: {
    total: number;
    pendingReview: number;
    reviewing: number;
    approvedNotify: number;
    closed: number;
  };
};

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, '').slice(0, 30);
}

function statusLabel(status: TipStatus, locale: 'th' | 'en') {
  if (status === 'pending_review') return locale === 'th' ? 'รอตรวจสอบ' : 'Pending review';
  if (status === 'reviewing') return locale === 'th' ? 'กำลังตรวจสอบ' : 'Reviewing';
  if (status === 'approved_notify') return locale === 'th' ? 'อนุมัติแจ้งเตือน' : 'Approved for notify';
  if (status === 'closed') return locale === 'th' ? 'ปิดเรื่อง' : 'Closed';
  return locale === 'th' ? 'ไม่ทราบสถานะ' : 'Unknown status';
}

function statusTone(status: TipStatus) {
  if (status === 'pending_review') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'reviewing') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'approved_notify') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'closed') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function RiskTipPage() {
  const { locale } = useI18n();
  const isThai = locale === 'th';
  const [number, setNumber] = useState('');
  const [clueText, setClueText] = useState('');
  const [loading, setLoading] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tips, setTips] = useState<TipItem[]>([]);
  const [summary, setSummary] = useState<TipsPayload['summary'] | null>(null);
  const [result, setResult] = useState<{
    ok?: boolean;
    riskLevel?: string;
    workflowStatus?: TipStatus;
    persisted?: boolean;
    error?: string;
  } | null>(null);

  async function loadTips() {
    setTipsLoading(true);
    try {
      const response = await fetch('/api/phone/risk-tips', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as TipsPayload;
      setTips(payload.tips ?? []);
      setSummary(payload.summary ?? null);
    } finally {
      setTipsLoading(false);
    }
  }

  useEffect(() => {
    void loadTips();
  }, []);

  async function submitTip() {
    const value = normalizePhone(number);
    if (value.length < 6) {
      setResult({ error: isThai ? 'กรุณากรอกเบอร์ที่ถูกต้อง (อย่างน้อย 6 หลัก)' : 'Please enter a valid number (at least 6 digits)' });
      return;
    }
    if (clueText.trim().length < 2) {
      setResult({ error: isThai ? 'กรุณากรอกเบาะแสอย่างน้อย 2 ตัวอักษร' : 'Please provide at least 2 characters of clue' });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/phone/risk-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: value,
          action: 'report',
          clueText: clueText.trim(),
          source: 'manual_tip',
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        riskLevel?: string;
        workflowStatus?: TipStatus;
        persisted?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setResult({ error: payload.error ?? (isThai ? 'บันทึกเบาะแสไม่สำเร็จ' : 'Failed to submit clue') });
        return;
      }

      setResult({
        ok: true,
        riskLevel: payload.riskLevel,
        workflowStatus: payload.workflowStatus ?? 'pending_review',
        persisted: payload.persisted,
      });
      setNumber('');
      setClueText('');
      await loadTips();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className='space-y-3 pb-24 pt-2'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <div className='mb-3 flex items-center gap-2'>
          <Link href='/' className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600' aria-label={isThai ? 'ย้อนกลับ' : 'Back'}>
            <ChevronLeft className='h-4 w-4' />
          </Link>
          <div>
            <h1 className='text-lg font-semibold text-slate-900'>{isThai ? 'แจ้งเบาะแสเบอร์มิจฉาชีพ' : 'Report scam number clue'}</h1>
            <p className='text-xs text-slate-500'>
              {isThai
                ? 'กรอกเบอร์และรายละเอียด ระบบจะเก็บข้อมูลเพื่อตรวจสอบและแจ้งเตือนผู้ใช้งานในแอป'
                : 'Provide phone number and clue details. The system will review and notify app users.'}
            </p>
          </div>
        </div>

        <div className='space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3'>
          <label className='text-xs font-semibold text-slate-700'>{isThai ? 'เบอร์ต้องสงสัย / มิจฉาชีพ' : 'Suspicious / scam number'}</label>
          <input
            type='tel'
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder={isThai ? 'เช่น 08x-xxx-xxxx' : 'e.g. +66xxxxxxxxx'}
            className='h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400'
          />

          <label className='text-xs font-semibold text-slate-700'>{isThai ? 'เบาะแสเพิ่มเติม' : 'Additional clue'}</label>
          <textarea
            value={clueText}
            onChange={(event) => setClueText(event.target.value)}
            placeholder={isThai ? 'ตัวอย่าง: โทรอ้างเป็นเจ้าหน้าที่รัฐ ขอ OTP หรือขอให้โอนเงิน' : 'Example: caller impersonates authority, asks for OTP or transfer'}
            rows={4}
            className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400'
          />

          <button
            type='button'
            onClick={() => void submitTip()}
            disabled={loading}
            className='inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white disabled:opacity-60'
          >
            <Send className='h-4 w-4' />
            {loading ? (isThai ? 'กำลังบันทึก...' : 'Submitting...') : (isThai ? 'ส่งเบาะแส' : 'Submit clue')}
          </button>
        </div>

        {result?.error ? <p className='mt-2 text-xs text-rose-600'>{result.error}</p> : null}

        {result?.ok ? (
          <div className='mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800'>
            <p className='inline-flex items-center gap-1 font-semibold'>
              <ShieldAlert className='h-3.5 w-3.5' />
              {isThai ? 'รับเบาะแสเรียบร้อย' : 'Clue submitted'}
            </p>
            <p className='mt-1'>
              {isThai ? 'สถานะ workflow' : 'Workflow status'}:{' '}
              <span className='font-semibold'>{statusLabel(result.workflowStatus ?? 'pending_review', locale)}</span> | {isThai ? 'ระดับความเสี่ยง' : 'Risk level'}:{' '}
              <span className='font-semibold'>{result.riskLevel ?? 'unknown'}</span>
            </p>
          </div>
        ) : null}

        <div className='mt-3 rounded-xl border border-slate-200 bg-white p-3'>
          <div className='flex items-center justify-between'>
            <p className='text-sm font-semibold text-slate-900'>{isThai ? 'รายการเบาะแสของฉัน' : 'My clue reports'}</p>
            <p className='text-xs text-slate-500'>{isThai ? 'ทั้งหมด' : 'Total'} {summary?.total ?? 0}</p>
          </div>
          <div className='mt-2 flex flex-wrap gap-2'>
            <span className='rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700'>{isThai ? 'รอตรวจสอบ' : 'Pending'} {summary?.pendingReview ?? 0}</span>
            <span className='rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700'>{isThai ? 'กำลังตรวจ' : 'Reviewing'} {summary?.reviewing ?? 0}</span>
            <span className='rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700'>{isThai ? 'อนุมัติแจ้งเตือน' : 'Approved'} {summary?.approvedNotify ?? 0}</span>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>{isThai ? 'ปิดเรื่อง' : 'Closed'} {summary?.closed ?? 0}</span>
          </div>

          <div className='mt-2 space-y-2'>
            {tipsLoading ? (
              <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500'>{isThai ? 'กำลังโหลดรายการ...' : 'Loading reports...'}</div>
            ) : tips.length === 0 ? (
              <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500'>{isThai ? 'ยังไม่มีเบาะแสที่ส่ง' : 'No reports submitted yet'}</div>
            ) : (
              tips.slice(0, 20).map((tip) => (
                <div key={tip.id} className='rounded-lg border border-slate-200 bg-slate-50 p-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-xs font-semibold text-slate-800'>{tip.number}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(tip.workflowStatus)}`}>{statusLabel(tip.workflowStatus, locale)}</span>
                  </div>
                  <p className='mt-1 text-[11px] text-slate-600'>{tip.clueText || '-'}</p>
                  <p className='mt-1 text-[10px] text-slate-500'>{new Date(tip.createdAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
