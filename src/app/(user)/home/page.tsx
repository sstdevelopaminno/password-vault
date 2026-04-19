'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Bell,
  ChevronRight,
  Database,
  HardDrive,
  PhoneCall,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import {
  mobilePermissionLabel,
  mobilePermissionTone,
  readMobilePermissionHealthReport,
  type MobilePermissionHealthReport,
} from '@/lib/mobile-permission-health';

type AlertRow = {
  id: string;
  number: string;
  level: 'safe' | 'suspicious' | 'high_risk';
  message: string;
};

type AlertsResponse = {
  alerts: AlertRow[];
  summary: {
    total: number;
    highRiskCount: number;
    suspiciousCount: number;
  };
};


const actionTiles = [
  { href: '/contacts', title: 'ผู้ติดต่อ', subtitle: 'รายชื่อมือถือ', icon: Smartphone },
  { href: '/dialer', title: 'โทรด่วน', subtitle: 'โทรออกทันที', icon: PhoneCall },
  { href: '/risk-check', title: 'ตรวจเบอร์', subtitle: 'AI Scan', icon: ShieldCheck },
  { href: '/risk-alerts', title: 'บล็อก/รายงาน', subtitle: 'เบอร์เสี่ยง', icon: ShieldX },
];

function tone(level: AlertRow['level']) {
  if (level === 'safe') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (level === 'suspicious') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-rose-600 bg-rose-50 border-rose-200';
}

function levelLabel(level: AlertRow['level']) {
  if (level === 'safe') return 'ปลอดภัย';
  if (level === 'suspicious') return 'น่าสงสัย';
  return 'เสี่ยงสูง';
}

export default function HomePage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [summary, setSummary] = useState<AlertsResponse['summary'] | null>(null);
  const [permissionReport, setPermissionReport] = useState<MobilePermissionHealthReport | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch('/api/phone/risk-alerts', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: AlertsResponse | null) => {
        if (ignore || !payload) return;
        setAlerts(payload.alerts ?? []);
        setSummary(payload.summary ?? null);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  const recentChecks = useMemo(() => alerts.slice(0, 3), [alerts]);

  async function checkMobilePermissions() {
    setCheckingPermissions(true);
    try {
      const report = await readMobilePermissionHealthReport({ requestNativeCameraPermission: true });
      setPermissionReport(report);
    } finally {
      setCheckingPermissions(false);
    }
  }

  return (
    <section className='relative space-y-3 pb-20'>
      <div className='rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_10px_32px_rgba(37,99,235,0.14)] backdrop-blur'>
        <div className='mb-4 flex items-center justify-between text-sm text-slate-600'>
          <span className='font-semibold'>9:41</span>
          <Link href='/risk-alerts' className='rounded-xl bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200' aria-label='แจ้งเตือน'>
            <Bell className='h-4 w-4' />
          </Link>
        </div>

        <div className='mb-4 flex items-center gap-3'>
          <Image src='/icons/vault-logo.png' alt='Vault Logo' width={48} height={48} className='h-12 w-12 rounded-2xl object-cover' priority />
          <div>
            <h1 className='text-2xl font-semibold text-slate-900'>Vault</h1>
            <p className='text-xs text-slate-500'>V17.0.0</p>
            <p className='text-xs text-slate-500'>Premium Security</p>
          </div>
        </div>

        <div className='mb-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Premium Protection</h2>
          <p className='mt-1 text-xs text-slate-600'>ปกป้องรหัสผ่าน การโทร และข้อมูลส่วนตัว</p>

          <Link href='/risk-check' className='mt-3 flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 transition hover:border-blue-300 hover:text-slate-700'>
            <span>ค้นหาเบอร์/ชื่อผู้ติดต่อ</span>
            <ChevronRight className='h-4 w-4' />
          </Link>

          <div className='mt-3 flex flex-wrap gap-2'>
            <span className='rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600'>คะแนนระบบ</span>
            <span className='rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700'>เบอร์เสี่ยง {summary?.highRiskCount ?? 0}</span>
            <span className='rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600'>โน้ตลับ</span>
          </div>
        </div>

        <div className='mb-3 grid grid-cols-2 gap-2'>
          {actionTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.href} href={tile.href} className='rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-300 hover:shadow-sm'>
                <div className='mb-2 inline-flex rounded-lg bg-blue-50 p-2 text-blue-600'>
                  <Icon className='h-4 w-4' />
                </div>
                <p className='text-sm font-semibold text-slate-900'>{tile.title}</p>
                <p className='text-xs text-slate-500'>{tile.subtitle}</p>
              </Link>
            );
          })}
        </div>

        <div className='mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3'>
          <h3 className='text-sm font-semibold text-emerald-900'>Phone Protection</h3>
          <p className='mt-1 text-xs leading-5 text-emerald-800'>ระบบเฝ้าระวังการโทรหลอกลวง พบเบอร์ต้องสงสัยจะแจ้งเตือน</p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <Link href='/risk-alerts' className='inline-flex h-9 items-center rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700'>
              เปิดใช้ระบบ
            </Link>
            <button type='button' onClick={() => setShowIosGuide(true)} className='inline-flex h-9 items-center rounded-xl border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700'>
              ติดตั้ง PWA บน iOS
            </button>
          </div>
        </div>

        <div className='mb-3 rounded-2xl border border-slate-200 bg-white p-3'>
          <div className='mb-2 flex items-center justify-between'>
            <h3 className='text-sm font-semibold text-slate-900'>ตรวจสิทธิจากมือถือ</h3>
            <button
              type='button'
              onClick={() => void checkMobilePermissions()}
              disabled={checkingPermissions}
              className='inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-60'
            >
              {checkingPermissions ? 'กำลังตรวจ...' : 'ตรวจสิทธิ'}
            </button>
          </div>

          {permissionReport ? (
            <div className='space-y-2'>
              <p className='text-xs text-slate-500'>Runtime: {permissionReport.runtimeMode}</p>
              <div className='flex flex-wrap gap-2'>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${mobilePermissionTone(permissionReport.notification)}`}>
                  Notifications: {mobilePermissionLabel(permissionReport.notification)}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${mobilePermissionTone(permissionReport.camera)}`}>
                  Camera: {mobilePermissionLabel(permissionReport.camera)}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${permissionReport.pushSupported ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                  Push: {permissionReport.pushSupported ? 'รองรับ' : 'ไม่รองรับ'}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${permissionReport.serviceWorkerSupported ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                  SW: {permissionReport.serviceWorkerSupported ? 'พร้อม' : 'ไม่พร้อม'}
                </span>
              </div>
              <p className='text-[11px] text-slate-500'>ตรวจล่าสุด: {new Date(permissionReport.checkedAt).toLocaleString('th-TH')}</p>
              <Link href='/settings/mobile-permissions' className='inline-flex text-xs font-semibold text-blue-600'>
                เปิดหน้า Mobile Permission Health
              </Link>
            </div>
          ) : (
            <div className='space-y-1'>
              <p className='text-xs text-slate-500'>กดปุ่มตรวจสิทธิเพื่ออ่านสถานะจากอุปกรณ์มือถือปัจจุบัน</p>
              <Link href='/settings/mobile-permissions' className='inline-flex text-xs font-semibold text-blue-600'>
                เปิดหน้า Mobile Permission Health
              </Link>
            </div>
          )}
        </div>

        <div className='mb-3 rounded-2xl border border-slate-200 bg-white p-3'>
          <div className='mb-2 flex items-center justify-between'>
            <h3 className='text-sm font-semibold text-slate-900'>เบอร์ที่ตรวจล่าสุด</h3>
            <Link href='/phone-profile?number=091-998-7788' className='text-xs font-semibold text-blue-600'>ดูโปรไฟล์เบอร์</Link>
          </div>
          <div className='space-y-2'>
            {recentChecks.length === 0 ? (
              <div className='rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500'>กำลังโหลดข้อมูลล่าสุด...</div>
            ) : (
              recentChecks.map((row) => (
                <div key={row.id} className='flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2'>
                  <p className='text-sm font-medium text-slate-800'>{row.number}</p>
                  <div className='flex items-center gap-2'>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone(row.level)}`}>{levelLabel(row.level)}</span>
                    <span className='text-xs font-semibold text-slate-600'>{row.level === 'high_risk' ? 'บล็อก' : row.level === 'suspicious' ? 'ตรวจ' : 'โทร'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <div className='rounded-2xl border border-slate-200 bg-white p-3'>
            <p className='text-xs font-semibold text-slate-500'>ระบบหลัก</p>
            <div className='mt-2 space-y-1 text-xs text-slate-600'>
              <p className='inline-flex items-center gap-1'><Server className='h-3.5 w-3.5' /> เซิร์ฟเวอร์</p>
              <p className='inline-flex items-center gap-1'><Database className='h-3.5 w-3.5' /> ฐานข้อมูล</p>
              <p className='inline-flex items-center gap-1'><Wifi className='h-3.5 w-3.5' /> เครือข่าย</p>
            </div>
          </div>

          <div className='rounded-2xl border border-slate-200 bg-white p-3'>
            <p className='text-xs font-semibold text-slate-500'>พื้นที่จัดเก็บ</p>
            <p className='mt-2 text-2xl font-semibold text-slate-900'>12%</p>
            <p className='mt-1 text-xs text-slate-500'>9.23KB / 50MB</p>
            <div className='mt-2 h-2 rounded-full bg-slate-100'>
              <div className='h-2 w-[12%] rounded-full bg-blue-500' />
            </div>
            <p className='mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500'>
              <HardDrive className='h-3.5 w-3.5' />
              ปลอดภัย
            </p>
          </div>
        </div>
      </div>

      <Link
        href='/dialer'
        className='fixed bottom-24 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(37,99,235,0.35)] transition hover:opacity-95'
      >
        <ShieldAlert className='h-4 w-4' />
        โทรออกปลอดภัย
      </Link>

      {showIosGuide ? (
        <div className='fixed inset-0 z-[120] flex items-center justify-center px-4' role='dialog' aria-modal='true'>
          <button type='button' className='absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]' onClick={() => setShowIosGuide(false)} aria-label='ปิด' />
          <div className='relative z-10 w-[min(92vw,420px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-base font-semibold text-slate-900'>ติดตั้ง PWA บน iPhone/iPad</p>
                <p className='mt-1 text-xs leading-5 text-slate-600'>สำหรับความเสถียรสูง แนะนำติดตั้งผ่าน Safari แล้วเพิ่มลง Home Screen</p>
              </div>
              <button type='button' onClick={() => setShowIosGuide(false)} className='rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700' aria-label='ปิด'>
                <X className='h-4 w-4' />
              </button>
            </div>

            <ol className='mt-4 space-y-2 text-[13px] text-slate-700'>
              <li className='rounded-lg bg-slate-50 px-3 py-2'>1) เปิดเว็บนี้ด้วย Safari</li>
              <li className='rounded-lg bg-slate-50 px-3 py-2'>2) กดปุ่ม Share</li>
              <li className='rounded-lg bg-slate-50 px-3 py-2'>3) เลือก Add to Home Screen</li>
              <li className='rounded-lg bg-slate-50 px-3 py-2'>4) กด Add แล้วเปิดจากไอคอนบนหน้าจอหลัก</li>
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  );
}
