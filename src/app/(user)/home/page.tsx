'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, FileText, KeyRound, KeySquare, LifeBuoy, Settings } from 'lucide-react';
import { APP_VERSION } from '@/lib/app-version';

type VersionResponse = {
  appVersion?: string;
};

type ProfileResponse = {
  fullName?: string;
  role?: string;
  status?: string;
};

const actionTiles = [
  { href: '/notes', title: 'โน้ต', subtitle: 'บันทึกส่วนตัว', icon: FileText },
  { href: '/vault', title: 'คลังรหัสผ่าน', subtitle: 'จัดการข้อมูลลับ', icon: KeyRound },
  { href: '/org-shared', title: 'ทีมแชร์', subtitle: 'ทำงานร่วมกัน', icon: KeySquare },
  { href: '/settings', title: 'ตั้งค่า', subtitle: 'บัญชีผู้ใช้', icon: Settings },
];

export default function HomePage() {
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [userRole, setUserRole] = useState('user');
  const [userStatus, setUserStatus] = useState('active');
  const [userFullName, setUserFullName] = useState('');

  useEffect(() => {
    let ignore = false;

    fetch('/api/version', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: VersionResponse | null) => {
        if (ignore || !payload?.appVersion) return;
        setAppVersion(String(payload.appVersion));
      })
      .catch(() => undefined);

    fetch('/api/profile/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ProfileResponse | null) => {
        if (ignore || !payload) return;
        setUserRole(String(payload.role ?? 'user'));
        setUserStatus(String(payload.status ?? 'active'));
        setUserFullName(String(payload.fullName ?? ''));
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section className='space-y-3 pb-20 pt-[max(10px,env(safe-area-inset-top))]'>
      <div className='mb-3 flex items-start gap-3'>
        <Image src='/icons/vault-logo.png' alt='Vault Logo' width={48} height={48} className='h-12 w-12 rounded-2xl object-cover' priority />
        <div className='min-w-0'>
          <h1 className='text-2xl font-semibold text-slate-900'>Vault</h1>
          <p className='text-xs text-slate-500'>{appVersion}</p>
          <p className='text-xs text-slate-500'>Core Workspace</p>
          <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
            <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>สิทธิ์: {userRole}</span>
            <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700'>สถานะ: {userStatus}</span>
            {userFullName ? <span className='truncate text-[11px] text-slate-500'>{userFullName}</span> : null}
          </div>
        </div>
      </div>

      <div className='mb-3 rounded-2xl border border-slate-200 bg-white p-3'>
        <h2 className='text-sm font-semibold text-slate-900'>ระบบพร้อมใช้งาน</h2>
        <p className='mt-1 text-xs text-slate-600'>โหมดหลักถูกปรับให้สะอาด เน้นเสถียรภาพและการทำงานหลักของ Vault</p>
        <Link href='/settings' className='mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 transition hover:border-blue-300 hover:text-slate-800'>
          ตรวจสอบการตั้งค่า
          <ChevronRight className='h-4 w-4' />
        </Link>
      </div>

      <div className='grid grid-cols-2 gap-2'>
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

      <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
        <Link href='/help-center' className='inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700'>
          <LifeBuoy className='h-4 w-4' />
          Help Center
        </Link>
      </div>
    </section>
  );
}
