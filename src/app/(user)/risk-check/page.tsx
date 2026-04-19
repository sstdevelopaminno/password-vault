'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ShieldCheck, ShieldX } from 'lucide-react';

type RiskResult = {
  number: string;
  level: 'safe' | 'suspicious' | 'high_risk';
  score: number;
  verdict: string;
  reasons: string[];
  recommendedAction: 'allow' | 'verify' | 'block';
};

function tone(level: RiskResult['level']) {
  if (level === 'safe') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (level === 'suspicious') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

export default function RiskCheckPage() {
  const [number, setNumber] = useState('');
  const [result, setResult] = useState<RiskResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runCheck() {
    setLoading(true);
    try {
      const response = await fetch('/api/phone/risk-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number }),
      });
      const payload = (await response.json()) as { result?: RiskResult };
      setResult(payload.result ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className='space-y-3'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>หน้าตรวจเบอร์เสี่ยง</h1>
        <p className='mt-1 text-sm text-slate-600'>AI Scan ประเมินความเสี่ยงเบอร์แบบทันที</p>

        <div className='mt-3 rounded-xl border border-slate-200 bg-white p-3'>
          <label className='text-xs font-semibold text-slate-500'>กรอกหมายเลขโทรศัพท์</label>
          <input
            type='tel'
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder='เช่น 08x-xxx-xxxx'
            className='mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400'
          />
          <div className='mt-2 flex gap-2'>
            <button
              type='button'
              onClick={() => void runCheck()}
              disabled={loading || number.trim().length < 6}
              className='inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-60'
            >
              <ShieldCheck className='h-3.5 w-3.5' /> {loading ? 'กำลังตรวจ...' : 'ตรวจเบอร์'}
            </button>
            <Link href='/risk-alerts' className='inline-flex h-9 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700'>
              <ShieldX className='h-3.5 w-3.5' /> บล็อก/รายงาน
            </Link>
          </div>
        </div>

        {result ? (
          <div className='mt-3 rounded-xl border border-slate-200 bg-white p-3'>
            <div className='flex items-center justify-between'>
              <p className='text-sm font-semibold text-slate-900'>{result.number}</p>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tone(result.level)}`}>
                {result.verdict} ({result.score})
              </span>
            </div>
            <ul className='mt-2 space-y-1 text-xs text-slate-600'>
              {result.reasons.map((reason) => (
                <li key={reason}>- {reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className='mt-3 inline-flex items-center gap-1 text-xs text-slate-500'>
          <AlertTriangle className='h-3.5 w-3.5' /> ผลลัพธ์เป็นการประเมินความเสี่ยงเบื้องต้น
        </p>
      </div>
    </section>
  );
}
