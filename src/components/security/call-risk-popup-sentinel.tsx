'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, PhoneCall, ShieldAlert, X } from 'lucide-react';

type RiskLevel = 'safe' | 'suspicious' | 'high_risk';

type PopupItem = {
  id: string;
  number: string;
  level: RiskLevel;
  title: string;
  message: string;
  source: 'dialer' | 'network';
  occurredAt: string;
};

type RiskAlertRow = {
  id: string;
  number: string;
  level: RiskLevel;
  message: string;
  detectedAt: string;
};

type RiskAlertsResponse = {
  alerts: RiskAlertRow[];
};

type CallRiskEventDetail = {
  number: string;
  level: RiskLevel;
  score?: number;
  verdict?: string;
  message?: string;
};

const STORAGE_KEY = 'pv_call_risk_popup_seen_v1';
const POLL_INTERVAL_MS = 20000;

function readSeenMap() {
  if (typeof window === 'undefined') return {} as Record<string, string>;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {} as Record<string, string>;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function writeSeenMap(next: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function levelTone(level: RiskLevel) {
  if (level === 'high_risk') return 'border-rose-300 bg-rose-50 text-rose-700';
  if (level === 'suspicious') return 'border-amber-300 bg-amber-50 text-amber-700';
  return 'border-emerald-300 bg-emerald-50 text-emerald-700';
}

function levelLabel(level: RiskLevel) {
  if (level === 'high_risk') return 'มิจฉาชีพเสี่ยงสูง';
  if (level === 'suspicious') return 'เบอร์ต้องสงสัย';
  return 'ปลอดภัย';
}

function toItemKey(number: string, occurredAt: string) {
  return `${number}|${occurredAt}`;
}

function normalizeDate(value: string | undefined) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function CallRiskPopupSentinel() {
  const [queue, setQueue] = useState<PopupItem[]>([]);
  const queueRef = useRef<PopupItem[]>([]);
  const seenRef = useRef<Record<string, string>>({});
  const active = queue[0] ?? null;

  const markSeen = (item: PopupItem) => {
    const key = toItemKey(item.number, item.occurredAt);
    const next = { ...seenRef.current, [key]: item.occurredAt };
    seenRef.current = next;
    writeSeenMap(next);
  };

  const enqueue = (item: PopupItem) => {
    if (item.level === 'safe') return;
    const key = toItemKey(item.number, item.occurredAt);
    if (seenRef.current[key]) return;
    if (queueRef.current.some((entry) => toItemKey(entry.number, entry.occurredAt) === key)) return;

    const next = [...queueRef.current, item].slice(0, 10);
    queueRef.current = next;
    setQueue(next);
  };

  const dismissActive = () => {
    if (!active) return;
    markSeen(active);
    const next = queueRef.current.slice(1);
    queueRef.current = next;
    setQueue(next);
  };

  useEffect(() => {
    seenRef.current = readSeenMap();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onCallRisk = (event: Event) => {
      const detail = (event as CustomEvent<CallRiskEventDetail>).detail;
      if (!detail?.number) return;
      const occurredAt = new Date().toISOString();
      enqueue({
        id: `dialer-${detail.number}-${occurredAt}`,
        number: detail.number,
        level: detail.level,
        title: detail.level === 'high_risk' ? 'เตือนภัยเบอร์มิจฉาชีพ' : 'เตือนภัยเบอร์ต้องสงสัย',
        message:
          detail.message ??
          (detail.level === 'high_risk'
            ? `ระบบแนะนำให้บล็อกเบอร์ ${detail.number} ทันที`
            : `ระบบแนะนำให้ตรวจสอบข้อมูลก่อนรับสาย/โทรกลับ (${detail.number})`),
        source: 'dialer',
        occurredAt,
      });
    };

    window.addEventListener('pv-call-risk-detected', onCallRisk as EventListener);
    return () => window.removeEventListener('pv-call-risk-detected', onCallRisk as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let disposed = false;
    let timer = 0;

    const poll = async () => {
      if (disposed) return;
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      try {
        const response = await fetch('/api/phone/risk-alerts', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as RiskAlertsResponse;
        const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
        for (const alert of alerts) {
          if (alert.level !== 'high_risk' && alert.level !== 'suspicious') continue;
          const occurredAt = normalizeDate(alert.detectedAt);
          enqueue({
            id: `network-${alert.id}`,
            number: alert.number,
            level: alert.level,
            title: alert.level === 'high_risk' ? 'ตรวจพบเบอร์มิจฉาชีพ' : 'ตรวจพบเบอร์ต้องสงสัย',
            message: alert.message || `พบความเสี่ยงจากเบอร์ ${alert.number}`,
            source: 'network',
            occurredAt,
          });
        }
      } catch {
        // ignore poll failures
      }
    };

    void poll();
    timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, []);

  const occurredLabel = useMemo(() => {
    if (!active) return '-';
    const date = new Date(active.occurredAt);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH');
  }, [active]);

  if (!active) return null;

  return (
    <div className='fixed inset-0 z-[130] flex items-center justify-center px-4' role='dialog' aria-modal='true'>
      <button type='button' className='absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]' onClick={dismissActive} aria-label='ปิด' />
      <div className='relative z-10 w-[min(92vw,440px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.3)]'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='inline-flex items-center gap-1 text-base font-semibold text-slate-900'>
              <ShieldAlert className='h-4 w-4 text-rose-600' />
              {active.title}
            </p>
            <p className='mt-1 text-xs text-slate-500'>เวลา: {occurredLabel}</p>
          </div>
          <button type='button' onClick={dismissActive} className='rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700'>
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3'>
          <p className='text-sm font-semibold text-slate-900'>{active.number}</p>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelTone(active.level)}`}>
            {levelLabel(active.level)}
          </span>
          <p className='mt-2 text-xs text-slate-700'>{active.message}</p>
        </div>

        <div className='mt-3 flex flex-wrap gap-2'>
          <Link href='/risk-alerts' className='inline-flex h-9 items-center rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white'>
            เปิดหน้าจัดการเบอร์เสี่ยง
          </Link>
          <Link href='/risk-tip' className='inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700'>
            แจ้งเบาะแสเพิ่มเติม
          </Link>
          <button type='button' onClick={dismissActive} className='inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700'>
            <PhoneCall className='mr-1 h-3.5 w-3.5' />
            รับทราบ
          </button>
        </div>
        <p className='mt-2 inline-flex items-start gap-1 text-[11px] text-slate-500'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          การเตือนรับสายจากเครือข่ายโทรศัพท์โดยตรงขึ้นกับสิทธิ์/ข้อจำกัดระบบปฏิบัติการของอุปกรณ์
        </p>
      </div>
    </div>
  );
}

