'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, RefreshCw, Settings, ShieldCheck } from 'lucide-react';
import { openVaultShieldAppSettings } from '@/lib/vault-shield';
import {
  mobilePermissionLabel,
  mobilePermissionTone,
  readMobilePermissionHealthReport,
  type MobilePermissionHealthReport,
} from '@/lib/mobile-permission-health';

export default function MobilePermissionsPage() {
  const [report, setReport] = useState<MobilePermissionHealthReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshReport(requestNativeCameraPermission = false) {
    setLoading(true);
    try {
      const next = await readMobilePermissionHealthReport({ requestNativeCameraPermission });
      setReport(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshReport(false);
  }, []);

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      await refreshReport(false);
      return;
    }

    try {
      await Notification.requestPermission();
    } finally {
      await refreshReport(false);
    }
  }

  async function openDeviceSettings() {
    await openVaultShieldAppSettings();
  }

  return (
    <section className='space-y-4 pb-24 pt-2'>
      <div className='rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]'>
        <div className='mb-3 flex items-center gap-2'>
          <Link href='/settings' className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600'>
            <ChevronLeft className='h-4 w-4' />
          </Link>
          <div>
            <h1 className='text-lg font-semibold text-slate-900'>Mobile Permission Health</h1>
            <p className='text-xs text-slate-500'>ตรวจสิทธิการทำงานจากมือถือสำหรับทีมซัพพอร์ต</p>
          </div>
        </div>

        <div className='grid gap-2 sm:grid-cols-2'>
          <button
            type='button'
            onClick={() => void refreshReport(false)}
            disabled={loading}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-60'
          >
            <RefreshCw className={'h-4 w-4' + (loading ? ' animate-spin' : '')} />
            ตรวจใหม่
          </button>

          <button
            type='button'
            onClick={() => void refreshReport(true)}
            disabled={loading}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 disabled:opacity-60'
          >
            <ShieldCheck className='h-4 w-4' />
            ขอสิทธิกล้อง
          </button>

          <button
            type='button'
            onClick={() => void requestNotificationPermission()}
            disabled={loading}
            className='inline-flex h-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700 disabled:opacity-60'
          >
            ขอสิทธิแจ้งเตือน
          </button>

          <button
            type='button'
            onClick={() => void openDeviceSettings()}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700'
          >
            <Settings className='h-4 w-4' />
            เปิดหน้าตั้งค่าแอป
          </button>
        </div>

        <div className='mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3'>
          {report ? (
            <>
              <p className='text-xs text-slate-500'>Runtime: {report.runtimeMode}</p>
              <div className='mt-2 flex flex-wrap gap-2'>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${mobilePermissionTone(report.notification)}`}>
                  Notifications: {mobilePermissionLabel(report.notification)}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${mobilePermissionTone(report.camera)}`}>
                  Camera: {mobilePermissionLabel(report.camera)}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${report.pushSupported ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                  Push: {report.pushSupported ? 'รองรับ' : 'ไม่รองรับ'}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${report.serviceWorkerSupported ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                  Service Worker: {report.serviceWorkerSupported ? 'พร้อม' : 'ไม่พร้อม'}
                </span>
              </div>
              <p className='mt-2 text-[11px] text-slate-500'>ตรวจล่าสุด: {new Date(report.checkedAt).toLocaleString('th-TH')}</p>
            </>
          ) : (
            <p className='text-sm text-slate-500'>กำลังอ่านสถานะสิทธิจากอุปกรณ์...</p>
          )}
        </div>
      </div>
    </section>
  );
}
