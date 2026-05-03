'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PinModal } from '@/components/vault/pin-modal';
import { useI18n } from '@/i18n/provider';

const HISTORY_STORAGE_KEY = 'pv_calculator_history_v1';

type HistoryItem = {
  id: string;
  expression: string;
  result: string;
  createdAt: string;
};

type PinPolicy = {
  delete_calculator_history?: boolean;
};

function formatNumericStringForDisplay(raw: string, locale: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw || '0.00';
  const isWholeNumber = Number.isInteger(parsed);
  return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
    minimumFractionDigits: isWholeNumber ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatExpressionForDisplay(raw: string, locale: string) {
  if (!raw.trim()) return '0.00';
  let output = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (/[\d.]/.test(ch)) {
      let token = ch;
      i += 1;
      while (i < raw.length && /[\d.]/.test(raw[i])) {
        token += raw[i];
        i += 1;
      }
      if (/^\d+(\.\d+)?$/.test(token)) {
        output += formatNumericStringForDisplay(token, locale);
      } else {
        output += token;
      }
      continue;
    }
    output += ch;
    i += 1;
  }
  return output || '0.00';
}

function readHistoryFromStorage() {
  if (typeof window === 'undefined') return [] as HistoryItem[];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string' && typeof item.expression === 'string');
  } catch {
    return [];
  }
}

function saveHistoryToStorage(items: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage failures
  }
}

export default function CalculatorHistoryPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const isThai = locale === 'th';

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [pinPolicy, setPinPolicy] = useState<PinPolicy | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingClearAll, setPendingClearAll] = useState(false);

  const requirePinToDeleteHistory = pinPolicy?.delete_calculator_history !== false;

  useEffect(() => {
    setHistoryItems(readHistoryFromStorage());
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadPinPolicy = async () => {
      try {
        const response = await fetch('/api/pin/preferences', { cache: 'no-store' });
        if (!response.ok) return;
        const body = (await response.json().catch(() => ({}))) as { policy?: PinPolicy };
        if (mounted && body.policy) {
          setPinPolicy(body.policy);
        }
      } catch {
        // keep default requiring PIN
      }
    };
    void loadPinPolicy();
    return () => {
      mounted = false;
    };
  }, []);

  const historyCountLabel = useMemo(
    () => (isThai ? `${historyItems.length} รายการ` : `${historyItems.length} items`),
    [historyItems.length, isThai],
  );

  const removeOneNow = useCallback((id: string) => {
    setHistoryItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveHistoryToStorage(next);
      return next;
    });
  }, []);

  const clearAllNow = useCallback(() => {
    setHistoryItems([]);
    saveHistoryToStorage([]);
  }, []);

  const requestDeleteOne = (id: string) => {
    if (!requirePinToDeleteHistory) {
      removeOneNow(id);
      return;
    }
    setPendingDeleteId(id);
    setPendingClearAll(false);
    setPinModalOpen(true);
  };

  const requestClearAll = () => {
    if (!requirePinToDeleteHistory) {
      clearAllNow();
      return;
    }
    setPendingDeleteId(null);
    setPendingClearAll(true);
    setPinModalOpen(true);
  };

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <div className='neon-panel rounded-[24px] p-4'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
              onClick={() => router.push('/calculator')}
              aria-label={isThai ? 'ย้อนกลับ' : 'Back'}
            >
              <ArrowLeft className='h-4 w-4' />
            </button>
            <div>
              <h1 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'ประวัติย้อนหลัง' : 'History'}</h1>
              <p className='text-app-caption text-slate-300'>{historyCountLabel}</p>
            </div>
          </div>
          <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-3' onClick={requestClearAll}>
            <Trash2 className='mr-1 h-4 w-4' />
            {isThai ? 'ล้างทั้งหมด' : 'Clear all'}
          </Button>
        </div>
      </div>

      <div className='space-y-2'>
        {historyItems.length === 0 ? (
          <div className='neon-soft-panel rounded-[20px] p-4 text-center text-app-body text-slate-200'>
            {isThai ? 'ยังไม่มีประวัติการคำนวณ' : 'No calculation history yet.'}
          </div>
        ) : null}

        {historyItems.map((item) => (
          <div key={item.id} className='neon-soft-panel rounded-[18px] p-3'>
            <button
              type='button'
              className='w-full text-left'
              onClick={() =>
                router.push('/calculator?expression=' + encodeURIComponent(item.expression) + '&result=' + encodeURIComponent(item.result))
              }
            >
              <p className='line-clamp-1 font-mono text-app-caption font-semibold text-slate-100'>
                {formatExpressionForDisplay(item.expression, locale)} = {formatNumericStringForDisplay(item.result, locale)}
              </p>
              <p className='mt-1 text-[11px] text-slate-300'>
                <History className='mr-1 inline h-3.5 w-3.5' />
                {new Date(item.createdAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}
              </p>
            </button>
            <div className='mt-2 flex justify-end'>
              <Button type='button' variant='secondary' size='sm' className='h-8 rounded-xl px-3 text-rose-100' onClick={() => requestDeleteOne(item.id)}>
                <Trash2 className='mr-1 h-3.5 w-3.5' />
                {isThai ? 'ลบรายการนี้' : 'Delete'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {pinModalOpen ? (
        <PinModal
          action='delete_calculator_history'
          actionLabel={
            pendingClearAll
              ? isThai
                ? 'ล้างประวัติเครื่องคิดเลขทั้งหมด'
                : 'clear all calculator history'
              : isThai
                ? 'ลบประวัติเครื่องคิดเลข'
                : 'delete calculator history item'
          }
          targetItemId={pendingDeleteId ?? undefined}
          onClose={() => {
            setPinModalOpen(false);
            setPendingDeleteId(null);
            setPendingClearAll(false);
          }}
          onVerified={() => {
            setPinModalOpen(false);
            if (pendingClearAll) {
              clearAllNow();
            } else if (pendingDeleteId) {
              removeOneNow(pendingDeleteId);
            }
            setPendingDeleteId(null);
            setPendingClearAll(false);
          }}
        />
      ) : null}
    </section>
  );
}
