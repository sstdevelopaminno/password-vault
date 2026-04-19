'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock3, Phone, ShieldAlert, ShieldCheck } from 'lucide-react';

type ProfilePayload = {
  profile: {
    number: string;
    trustScore: number;
    reportCount: number;
    callAttempts24h: number;
    lastSeenAt: string;
    risk: {
      verdict: string;
      level: 'safe' | 'suspicious' | 'high_risk';
      score: number;
      reasons: string[];
    };
  };
};

function tone(level: 'safe' | 'suspicious' | 'high_risk') {
  if (level === 'safe') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (level === 'suspicious') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

export default function PhoneProfilePage() {
  const [profile, setProfile] = useState<ProfilePayload['profile'] | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const number = params.get('number') ?? '091-998-7788';

    let ignore = false;
    fetch(`/api/phone/profile?number=${encodeURIComponent(number)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ProfilePayload | null) => {
        if (ignore || !payload?.profile) return;
        setProfile(payload.profile);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  if (!profile) {
    return <section className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm text-sm text-slate-500'>กำลังโหลดโปรไฟล์เบอร์...</section>;
  }

  return (
    <section className='space-y-3'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>หน้าโปรไฟล์เบอร์</h1>
        <p className='mt-1 text-sm text-slate-600'>รายละเอียดเชิงลึกของหมายเลขที่ตรวจล่าสุด</p>

        <div className='mt-3 rounded-2xl border border-slate-200 bg-white p-3'>
          <p className='text-xs text-slate-500'>หมายเลข</p>
          <p className='text-xl font-semibold text-slate-900'>{profile.number}</p>
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${tone(profile.risk.level)}`}>
            <ShieldAlert className='h-3.5 w-3.5' /> ระดับความเสี่ยง: {profile.risk.verdict}
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <div className='rounded-xl border border-slate-200 bg-white p-3'>
            <p className='text-xs text-slate-500'>ความน่าเชื่อถือ</p>
            <p className='mt-1 text-lg font-semibold text-slate-900'>{profile.trustScore} / 100</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-3'>
            <p className='text-xs text-slate-500'>รายงานล่าสุด</p>
            <p className='mt-1 text-lg font-semibold text-slate-900'>{profile.reportCount} ครั้ง</p>
          </div>
        </div>

        <div className='rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600'>
          <p className='inline-flex items-center gap-1'><Clock3 className='h-4 w-4' /> ตรวจล่าสุด: {new Date(profile.lastSeenAt).toLocaleString('th-TH')}</p>
          <p className='mt-1 inline-flex items-center gap-1'><ShieldCheck className='h-4 w-4' /> ความพยายามโทร 24 ชั่วโมง: {profile.callAttempts24h} ครั้ง</p>
        </div>

        <div className='flex gap-2'>
          <Link href={`/dialer?number=${encodeURIComponent(profile.number)}`} className='inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white'>
            <Phone className='h-3.5 w-3.5' /> โทรออก
          </Link>
          <Link href='/risk-alerts' className='inline-flex h-9 items-center rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700'>
            บล็อก/รายงาน
          </Link>
        </div>
      </div>
    </section>
  );
}
