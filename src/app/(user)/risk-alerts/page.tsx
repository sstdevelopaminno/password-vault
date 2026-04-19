'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BellRing, ShieldAlert, ShieldX } from 'lucide-react';

type Alert = {
  id: string;
  number: string;
  message: string;
  detectedAt: string;
  level: 'safe' | 'suspicious' | 'high_risk';
};

type AlertsPayload = {
  alerts: Alert[];
  summary: {
    total: number;
    highRiskCount: number;
    suspiciousCount: number;
  };
};

function tone(level: Alert['level']) {
  if (level === 'safe') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (level === 'suspicious') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function levelLabel(level: Alert['level']) {
  if (level === 'safe') return 'ปลอดภัย';
  if (level === 'suspicious') return 'น่าสงสัย';
  return 'เสี่ยงสูง';
}

export default function RiskAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertsPayload['summary'] | null>(null);
  const [pendingNumber, setPendingNumber] = useState<string | null>(null);

  async function loadAlerts() {
    const response = await fetch('/api/phone/risk-alerts', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = (await response.json()) as AlertsPayload;
    setAlerts(payload.alerts ?? []);
    setSummary(payload.summary ?? null);
  }

  useEffect(() => {
    loadAlerts()
      .then(() => undefined)
      .catch(() => undefined);
  }, []);

  async function runAction(number: string, action: 'block' | 'report') {
    setPendingNumber(number + action);
    try {
      await fetch('/api/phone/risk-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, action, source: 'risk_alerts' }),
      });
      await loadAlerts();
    } finally {
      setPendingNumber(null);
    }
  }

  return (
    <section className='space-y-3'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>หน้าแจ้งเตือนความเสี่ยง</h1>
        <p className='mt-1 text-sm text-slate-600'>รวมเหตุการณ์เบอร์เสี่ยงและการแจ้งเตือนการโทรหลอกลวง</p>

        <div className='mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3'>
          <p className='inline-flex items-center gap-1 text-sm font-semibold text-rose-700'>
            <ShieldAlert className='h-4 w-4' /> ระดับเตือนภัยวันนี้: สูง
          </p>
          <p className='mt-1 text-xs text-rose-600'>
            พบเบอร์เสี่ยงสูง {summary?.highRiskCount ?? 0} รายการ และน่าสงสัย {summary?.suspiciousCount ?? 0} รายการ
          </p>
          <Link href='/risk-tip' className='mt-2 inline-flex h-8 items-center rounded-lg bg-rose-600 px-2.5 text-xs font-semibold text-white'>
            แจ้งเบาะแสเพิ่มเติม
          </Link>
        </div>

        <div className='mt-3 space-y-2'>
          {alerts.map((item) => (
            <div key={item.id} className='rounded-xl border border-slate-200 bg-white p-3'>
              <div className='flex items-start justify-between gap-2'>
                <div>
                  <p className='text-sm font-semibold text-slate-900'>{item.number}</p>
                  <p className='text-xs text-slate-500'>{item.message}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${tone(item.level)}`}>{levelLabel(item.level)}</span>
              </div>
              <p className='mt-1 inline-flex items-center gap-1 text-xs text-slate-500'>
                <BellRing className='h-3.5 w-3.5' /> {new Date(item.detectedAt).toLocaleString('th-TH')}
              </p>
              <div className='mt-2 flex gap-2'>
                <button
                  type='button'
                  onClick={() => void runAction(item.number, 'block')}
                  disabled={pendingNumber === item.number + 'block'}
                  className='inline-flex h-8 items-center gap-1 rounded-lg bg-rose-600 px-2.5 text-xs font-semibold text-white disabled:opacity-60'
                >
                  <ShieldX className='h-3.5 w-3.5' /> บล็อก
                </button>
                <button
                  type='button'
                  onClick={() => void runAction(item.number, 'report')}
                  disabled={pendingNumber === item.number + 'report'}
                  className='inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-60'
                >
                  รายงาน
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
