'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Activity, Bell, ChevronRight, LockKeyhole, Phone, ReceiptText, ShieldCheck, RefreshCcw } from 'lucide-react';
import { APP_VERSION } from '@/lib/app-version';
import { BRAND_LOGO_URL } from '@/lib/brand-logo';

type VersionResponse = {
  appVersion?: string;
};

type ProfileResponse = {
  fullName?: string;
  role?: string;
  status?: string;
};

const actionTiles = [
  { href: '/private-contacts', title: 'เบอร์โทรลับ', subtitle: 'เก็บรายชื่อส่วนตัว แยกจากสมุดโทรศัพท์เครื่อง', icon: Phone },
  { href: '/billing', title: 'ออกใบเสร็จ/แจ้งหนี้', subtitle: 'สร้างบิล 2 รูปแบบ (A4 และ 80mm) พร้อมตั้งเวลาส่งอีเมล', icon: ReceiptText },
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
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.65rem)] sm:pt-2'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <Image src={BRAND_LOGO_URL} alt='Vault Logo' width={74} height={74} className='h-[74px] w-[74px] rounded-[22px] object-cover shadow-[0_0_24px_rgba(112,95,255,0.25)]' priority />
          <div className='min-w-0'>
            <h1 className='text-[32px] font-semibold leading-none tracking-[-0.02em] text-[#f2f7ff]'>Vault</h1>
            <p className='mt-1 text-[14px] text-[#9fb0d6]'>{appVersion}</p>
            <p className='text-[14px] text-[#9fb0d6]'>Core Workspace</p>
          </div>
        </div>

        <Link
          href='/settings/notifications'
          className='relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(122,145,220,0.38)] bg-[rgba(9,16,39,0.82)] text-[#c7d9ff] shadow-[0_10px_24px_rgba(0,0,0,0.28)]'
          aria-label='Notifications'
        >
          <Bell className='h-5 w-5' />
          <span className='absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500' />
        </Link>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <span className='neon-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold'>
          <ShieldCheck className='h-3.5 w-3.5' />
          สิทธิ์: {userRole}
        </span>
        <span className='neon-chip neon-chip-active inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold'>
          <Activity className='h-3.5 w-3.5' />
          สถานะ: {userStatus}
        </span>
      </div>

      <div className='neon-panel rounded-[30px] p-4'>
        <div className='flex items-start gap-3'>
          <div className='neon-icon-wrap inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#66d4ff]'>
            <ShieldCheck className='h-5 w-5' />
          </div>
          <div className='min-w-0 flex-1'>
            <h2 className='text-[28px] font-semibold leading-tight text-[#f3f8ff]'>ศูนย์ควบคุม Vault</h2>
            <p className='mt-1 text-[14px] leading-6 text-[#9db0d8]'>ข้อมูลของคุณได้รับการเข้ารหัสและปกป้องอย่างปลอดภัย</p>
          </div>
        </div>

        <div className='mt-4 grid grid-cols-3 gap-2.5'>
          <div className='neon-soft-panel rounded-[18px] p-3 text-center'>
            <LockKeyhole className='mx-auto h-5 w-5 text-[#3ed2ff]' />
            <p className='mt-1 text-xs text-[#a8bbdf]'>ข้อมูลเข้ารหัส</p>
            <p className='mt-0.5 text-[22px] font-semibold text-[#f6fbff]'>24</p>
          </div>
          <div className='neon-soft-panel rounded-[18px] p-3 text-center'>
            <ShieldCheck className='mx-auto h-5 w-5 text-emerald-300' />
            <p className='mt-1 text-xs text-[#a8bbdf]'>พร้อมใช้งาน</p>
            <p className='mt-0.5 text-[22px] font-semibold text-emerald-300'>100%</p>
          </div>
          <div className='neon-soft-panel rounded-[18px] p-3 text-center'>
            <RefreshCcw className='mx-auto h-5 w-5 text-[#d488ff]' />
            <p className='mt-1 text-xs text-[#a8bbdf]'>ซิงก์ล่าสุด</p>
            <p className='mt-0.5 text-[22px] font-semibold text-[#f6fbff]'>11:30</p>
          </div>
        </div>
      </div>

      <div className='flex items-center justify-between pt-1'>
        <h3 className='text-[20px] font-semibold text-[#f2f8ff]'>เมนูหลัก</h3>
        <Link href='/settings' className='inline-flex items-center gap-1 text-sm font-medium text-[#a9bddf]'>
          ดูทั้งหมด
          <ChevronRight className='h-4 w-4' />
        </Link>
      </div>

      <div className='grid gap-3'>
        {actionTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.href} href={tile.href} className='neon-panel group grid grid-cols-[76px_1fr_auto] items-center gap-3 rounded-[28px] p-3.5'>
              <div className='neon-icon-wrap inline-flex h-[76px] w-[76px] items-center justify-center rounded-[24px] text-[#79d8ff]'>
                <Icon className='h-8 w-8' />
              </div>
              <div className='min-w-0'>
                <p className='text-[18px] font-semibold leading-tight text-[#f5f8ff]'>{tile.title}</p>
                <p className='mt-1 text-[13px] leading-6 text-[#9db1d8]'>{tile.subtitle}</p>
              </div>
              <ChevronRight className='h-6 w-6 text-[#afc2e8] transition group-hover:text-white' />
            </Link>
          );
        })}
      </div>

      <div className='neon-soft-panel rounded-[24px] p-4'>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-sm font-semibold text-[#e7f1ff]'>กิจกรรมล่าสุด</p>
          <span className='text-xs text-[#9db0d8]'>เมื่อสักครู่</span>
        </div>
        <div className='mt-2 flex items-center justify-between rounded-xl border border-[rgba(117,146,222,0.26)] bg-[rgba(8,15,36,0.72)] px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold text-[#f1f7ff]'>เข้าสู่ระบบสำเร็จ</p>
            <p className='truncate text-xs text-[#9cb0d8]'>{userFullName || 'Vault User'}</p>
          </div>
          <span className='h-3 w-3 rounded-full bg-emerald-400' />
        </div>
      </div>
    </section>
  );
}
