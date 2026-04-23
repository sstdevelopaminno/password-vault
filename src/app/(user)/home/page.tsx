'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Bell, ChevronRight, Phone, ReceiptText, ShieldCheck } from 'lucide-react';
import { PinModal } from '@/components/vault/pin-modal';
import { APP_VERSION } from '@/lib/app-version';
import { BRAND_LOGO_URL } from '@/lib/brand-logo';

type VersionResponse = {
  appVersion?: string;
};

type ProfileResponse = {
  role?: string;
  status?: string;
};

type ActionTile = {
  href: string;
  title: string;
  subtitle: string;
  icon: typeof Phone;
  requiresPin?: boolean;
};

const actionTiles: ActionTile[] = [
  {
    href: '/private-contacts',
    title: 'เบอร์โทรลับ',
    subtitle: 'เก็บรายชื่อส่วนตัว แยกจากสมุดโทรศัพท์ในเครื่อง',
    icon: Phone,
    requiresPin: true,
  },
  {
    href: '/billing',
    title: 'ออกใบเสร็จ/แจ้งหนี้',
    subtitle: 'สร้างบิล A4 และ 80mm พร้อมตั้งเวลาส่งอีเมล',
    icon: ReceiptText,
  },
];

export default function HomePage() {
  const router = useRouter();
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [userRole, setUserRole] = useState('user');
  const [userStatus, setUserStatus] = useState('active');
  const [pendingProtectedHref, setPendingProtectedHref] = useState<string | null>(null);

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
          <Image
            src={BRAND_LOGO_URL}
            alt='Vault Logo'
            width={74}
            height={74}
            className='h-[74px] w-[74px] rounded-[22px] object-cover shadow-[0_0_24px_rgba(112,95,255,0.25)]'
            priority
          />
          <div className='min-w-0'>
            <h1 className='text-app-h1 font-semibold leading-none text-slate-100'>Vault</h1>
            <p className='mt-1 text-app-body text-slate-200'>{appVersion}</p>
            <p className='text-app-body text-slate-200'>Core Workspace</p>
          </div>
        </div>

        <Link
          href='/settings/notifications'
          className='relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-100 shadow-[var(--glow-soft)]'
          aria-label='Notifications'
        >
          <Bell className='h-5 w-5' />
          <span className='absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500' />
        </Link>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <span className='neon-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-app-caption font-semibold'>
          <ShieldCheck className='h-3.5 w-3.5' />
          สิทธิ์: {userRole}
        </span>
        <span className='neon-chip neon-chip-active inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-app-caption font-semibold'>
          <Activity className='h-3.5 w-3.5' />
          สถานะ: {userStatus}
        </span>
      </div>

      <div className='flex items-center justify-between pt-1'>
        <h3 className='text-app-h2 font-semibold text-slate-100'>เมนูหลัก</h3>
        <Link href='/settings' className='inline-flex items-center gap-1 text-app-body font-medium text-slate-200'>
          ดูทั้งหมด
          <ChevronRight className='h-4 w-4' />
        </Link>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        {actionTiles.map((tile) => {
          const Icon = tile.icon;
          const tileBody = (
            <>
              <div className='mb-1.5 flex items-center justify-between gap-1.5'>
                <div className='neon-icon-wrap inline-flex h-[46px] w-[46px] items-center justify-center rounded-[14px] text-slate-100'>
                  <Icon className='h-[18px] w-[18px]' />
                </div>
                <ChevronRight className='h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-100' />
              </div>
              <div className='min-w-0'>
                <p className='text-app-body font-semibold leading-tight text-slate-100'>{tile.title}</p>
                <p className='mt-0.5 line-clamp-2 text-app-micro leading-4 text-slate-200'>{tile.subtitle}</p>
              </div>
            </>
          );

          if (tile.requiresPin) {
            return (
              <button
                key={tile.href}
                type='button'
                onClick={() => setPendingProtectedHref(tile.href)}
                className='neon-panel group flex min-h-[120px] w-full flex-col rounded-[20px] p-2.5 text-left'
              >
                {tileBody}
              </button>
            );
          }

          return (
            <Link
              key={tile.href}
              href={tile.href}
              className='neon-panel group flex min-h-[120px] flex-col rounded-[20px] p-2.5'
            >
              {tileBody}
            </Link>
          );
        })}
      </div>

      {pendingProtectedHref ? (
        <PinModal
          action='unlock_app'
          actionLabel='เปิดเมนูเบอร์โทรลับ'
          onVerified={() => {
            const nextHref = pendingProtectedHref;
            setPendingProtectedHref(null);
            router.push(nextHref);
          }}
          onClose={() => setPendingProtectedHref(null)}
        />
      ) : null}
    </section>
  );
}
