'use client';

import { useState } from 'react';
import { PhoneCall, ShieldCheck, ShieldX } from 'lucide-react';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import { openVaultShieldAppSettings, requestVaultShieldCallPhonePermission } from '@/lib/vault-shield';

type DialPayload = {
  dial: {
    allowDirectDial: boolean;
    suggestedMode: 'normal' | 'blocked';
    message: string;
    risk: {
      verdict: string;
      level: 'safe' | 'suspicious' | 'high_risk';
      score: number;
    };
  };
};

function tone(level: 'safe' | 'suspicious' | 'high_risk') {
  if (level === 'safe') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (level === 'suspicious') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

export default function DialerPage() {
  const [number, setNumber] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('number') ?? '';
  });
  const [result, setResult] = useState<DialPayload['dial'] | null>(null);
  const [callPermissionState, setCallPermissionState] = useState<'idle' | 'denied' | 'denied_permanently' | 'unknown'>('idle');

  async function previewDial() {
    const response = await fetch('/api/phone/dialer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number }),
    });
    const payload = (await response.json()) as DialPayload;
    setResult(payload.dial);
  }

  async function handleSafeDial() {
    const trimmedNumber = number.trim();
    if (!trimmedNumber) return;

    if (result?.allowDirectDial === false) {
      setCallPermissionState('denied');
      return;
    }

    const runtime = detectRuntimeCapabilities();
    if (runtime.isCapacitorNative && runtime.isAndroid) {
      const permission = await requestVaultShieldCallPhonePermission();
      if (permission === 'denied' || permission === 'denied_permanently') {
        setCallPermissionState(permission);
        return;
      }

      setCallPermissionState(permission === 'unknown' ? 'unknown' : 'idle');
    } else {
      setCallPermissionState('idle');
    }

    window.location.href = `tel:${trimmedNumber}`;
  }

  return (
    <section className='space-y-3'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>หน้าโทรออก</h1>
        <p className='mt-1 text-sm text-slate-600'>โทรออกทันที พร้อมเช็กความเสี่ยงก่อนกดโทร</p>

        <div className='mt-3 rounded-2xl border border-slate-200 bg-white p-3'>
          <label className='text-xs font-semibold text-slate-500'>หมายเลขปลายทาง</label>
          <input
            type='tel'
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder='กรอกหมายเลขโทรศัพท์'
            className='mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-base outline-none focus:border-blue-400'
          />
          <button
            type='button'
            onClick={() => void previewDial()}
            className='mt-2 inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700'
          >
            <ShieldCheck className='h-3.5 w-3.5' /> ตรวจความเสี่ยงก่อนโทร
          </button>
        </div>

        {result ? (
          <div className='mt-3 rounded-xl border border-slate-200 bg-white p-3'>
            <p className='text-sm font-semibold text-slate-900'>{result.message}</p>
            <div className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${tone(result.risk.level)}`}>
              {result.risk.verdict} ({result.risk.score})
            </div>
          </div>
        ) : null}

        <div className='mt-3 flex gap-2'>
          <button
            type='button'
            onClick={() => void handleSafeDial()}
            className='inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-semibold text-white'
          >
            <PhoneCall className='h-4 w-4' /> โทรออกตอนนี้
          </button>
          {result?.allowDirectDial === false ? (
            <button type='button' className='inline-flex h-11 items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700'>
              <ShieldX className='h-3.5 w-3.5' /> บล็อก
            </button>
          ) : null}
        </div>

        {callPermissionState !== 'idle' ? (
          <div className='mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800'>
            {callPermissionState === 'denied_permanently'
              ? 'ยังไม่ได้อนุญาตสิทธิ์การโทร กรุณาเปิดสิทธิ์ในตั้งค่าแอป'
              : callPermissionState === 'unknown'
                ? 'ไม่สามารถยืนยันสิทธิ์การโทรได้ ระบบจะเปิดหน้าการโทรตามปกติ'
                : 'ไม่สามารถโทรออกได้ เนื่องจากสิทธิ์หรือความปลอดภัยของหมายเลข'}
            {callPermissionState === 'denied_permanently' ? (
              <button
                type='button'
                onClick={() => void openVaultShieldAppSettings()}
                className='ml-2 inline-flex rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800'
              >
                เปิดตั้งค่าแอป
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

