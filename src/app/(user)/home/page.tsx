'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Bell, ChevronRight, Download, Phone, ReceiptText, ShieldCheck, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PinModal } from '@/components/vault/pin-modal';
import { APP_VERSION } from '@/lib/app-version';
import { DEFAULT_ANDROID_APK_RELEASE } from '@/lib/android-apk-release';
import { BRAND_LOGO_URL } from '@/lib/brand-logo';
import { useI18n } from '@/i18n/provider';

type VersionResponse = {
  appVersion?: string;
};

type ProfileResponse = {
  role?: string;
  status?: string;
};

type ActionTile = {
  href: string;
  titleTh: string;
  titleEn: string;
  icon: typeof Phone;
  requiresPin?: boolean;
};

const actionTiles: ActionTile[] = [
  {
    href: '/private-contacts',
    titleTh: 'เบอร์โทรลับ',
    titleEn: 'Private Contacts',
    icon: Phone,
    requiresPin: true,
  },
  {
    href: '/billing',
    titleTh: 'ออกใบเสร็จ/แจ้งหนี้',
    titleEn: 'Billing Documents',
    icon: ReceiptText,
  },
];

const ANDROID_PROMO_IMAGE_URL =
  'https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/256922.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzI1NjkyMi5wbmciLCJpYXQiOjE3NzcwMDM3NzcsImV4cCI6MTgwODUzOTc3N30.0ngVxtTqFUbis4DF8j7FJ2d4wfpoXXzcPAxVvzhmBb4';

export default function HomePage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [userRole, setUserRole] = useState('user');
  const [userStatus, setUserStatus] = useState('active');
  const [pendingProtectedHref, setPendingProtectedHref] = useState<string | null>(null);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const isThai = locale === 'th';
  const tr = (th: string, en: string) => (isThai ? th : en);

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
          {tr('สิทธิ์', 'Role')}: {userRole}
        </span>
        <span className='neon-chip neon-chip-active inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-app-caption font-semibold'>
          <Activity className='h-3.5 w-3.5' />
          {tr('สถานะ', 'Status')}: {userStatus}
        </span>
      </div>

      <div className='flex items-center justify-between pt-1'>
        <h3 className='text-app-h2 font-semibold text-slate-100'>{tr('เมนูหลัก', 'Main Menu')}</h3>
        <Link href='/settings' className='inline-flex items-center gap-1 text-app-body font-medium text-slate-200'>
          {tr('ดูทั้งหมด', 'View all')}
          <ChevronRight className='h-4 w-4' />
        </Link>
      </div>

      <div className='grid grid-cols-2 gap-3'>
        {actionTiles.map((tile) => {
          const Icon = tile.icon;
          const tileBody = (
            <>
              <div className='mb-1.5 flex items-center gap-1.5'>
                <div className='neon-icon-wrap inline-flex h-[46px] w-[46px] items-center justify-center rounded-[14px] text-slate-100'>
                  <Icon className='h-[18px] w-[18px]' />
                </div>
              </div>
              <div className='min-w-0'>
                <p className='text-app-body font-semibold leading-tight text-slate-100'>{isThai ? tile.titleTh : tile.titleEn}</p>
              </div>
            </>
          );

          if (tile.requiresPin) {
            return (
              <button
                key={tile.href}
                type='button'
                onClick={() => setPendingProtectedHref(tile.href)}
                className='neon-panel group flex min-h-[104px] w-full flex-col rounded-[20px] p-3 text-left'
              >
                {tileBody}
              </button>
            );
          }

          return (
            <Link
              key={tile.href}
              href={tile.href}
              className='neon-panel group flex min-h-[104px] flex-col rounded-[20px] p-3'
            >
              {tileBody}
            </Link>
          );
        })}
      </div>

      <article className='neon-panel mt-3 space-y-3 rounded-[20px] p-4'>
        <div className='space-y-1.5'>
          <h4 className='text-app-h3 font-semibold text-slate-100'>{tr('ดาวน์โหลดแอป Android', 'Download Android App')}</h4>
          <p className='text-app-body leading-relaxed text-slate-200'>
            {tr(
              'ระบบนี้รองรับการใช้งานบน Android แบบติดตั้งลงเครื่อง (Native APK) เพื่อให้ทำงานได้เร็ว เสถียร และรองรับฟีเจอร์ฝั่งอุปกรณ์ได้ครบกว่าเว็บ',
              'This system supports full on-device Android installation (Native APK) for better speed, stability, and richer device features.',
            )}
          </p>
          <p className='text-app-caption leading-relaxed text-slate-300'>
            {tr(
              'ประโยชน์หลัก: เปิดใช้งานได้เร็วขึ้น, แจ้งเตือนมีประสิทธิภาพขึ้น, และใช้งานเมนูสำคัญได้ต่อเนื่องมากขึ้น โดย iOS ยังไม่รองรับในรอบนี้ (วางแผนพัฒนาต่อไป)',
              'Key benefits: faster launch, stronger notification behavior, and more consistent critical features. iOS support is planned in a future phase.',
            )}
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2 pt-1'>
          <Button
            type='button'
            variant='default'
            className='h-10 rounded-xl px-3 text-app-caption'
            onClick={() => {
              if (!DEFAULT_ANDROID_APK_RELEASE.downloadUrl) return;
              window.location.assign(DEFAULT_ANDROID_APK_RELEASE.downloadUrl);
            }}
          >
            <span className='inline-flex items-center gap-2'>
              <Smartphone className='h-4 w-4' />
              <Download className='h-4 w-4' />
              {tr('ดาวน์โหลดและติดตั้ง Android', 'Download & Install Android')}
            </span>
          </Button>

          <Button
            type='button'
            variant='secondary'
            className='h-10 rounded-xl px-3 text-app-caption'
            onClick={() => setShowAndroidGuide(true)}
          >
            {tr('ดูขั้นตอนติดตั้ง', 'Installation Steps')}
          </Button>
        </div>

        <button
          type='button'
          onClick={() => setShowAndroidGuide(true)}
          className='group block w-full overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] text-left shadow-[var(--glow-soft)]'
          aria-label={tr('เปิดคำแนะนำติดตั้งแอป Android', 'Open Android install guide')}
        >
          <Image
            src={ANDROID_PROMO_IMAGE_URL}
            alt={tr('ภาพแนะนำการติดตั้งแอป Android', 'Android app installation promo image')}
            width={1280}
            height={720}
            className='h-auto w-full object-cover transition duration-200 group-hover:scale-[1.01]'
          />
        </button>
      </article>

      {showAndroidGuide ? (
        <div className='fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/72 p-3 sm:items-center'>
          <div className='w-full max-w-md rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-1)] p-4 shadow-[0_28px_72px_rgba(5,12,35,0.6)] backdrop-blur'>
            <div className='mb-2 flex items-start justify-between gap-2'>
              <h5 className='text-app-h3 font-semibold text-slate-100'>{tr('ขั้นตอนติดตั้ง Android', 'Android Installation Guide')}</h5>
              <button
                type='button'
                onClick={() => setShowAndroidGuide(false)}
                className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-200'
                aria-label={tr('ปิด', 'Close')}
              >
                <X className='h-4 w-4' />
              </button>
            </div>

            <ol className='space-y-1.5 pl-5 text-app-body text-slate-200'>
              <li>{tr('กดปุ่ม "ดาวน์โหลดและติดตั้ง Android"', 'Tap "Download & Install Android".')}</li>
              <li>{tr('รอไฟล์ APK ดาวน์โหลดจนเสร็จ', 'Wait for the APK download to complete.')}</li>
              <li>{tr('เมื่อมีหน้าต่างติดตั้งเด้งขึ้น ให้กด "ติดตั้ง"', 'When the installer opens, tap "Install".')}</li>
              <li>{tr('หากระบบถามสิทธิ์ Unknown Apps ให้อนุญาตชั่วคราว แล้วกลับมาติดตั้งต่อ', 'If prompted for Unknown Apps permission, allow it temporarily and continue installation.')}</li>
              <li>{tr('ติดตั้งเสร็จแล้วกด "เปิด" เพื่อเข้าใช้งานแอป', 'After installation, tap "Open" to start using the app.')}</li>
            </ol>

            <p className='mt-3 text-app-caption text-slate-300'>
              {tr(
                'หมายเหตุ: ปัจจุบันรองรับ Android เป็นหลัก ส่วน iOS จะรองรับในเฟสถัดไป',
                'Note: Android is fully supported now. iOS support will come in the next phase.',
              )}
            </p>
          </div>
        </div>
      ) : null}

      {pendingProtectedHref ? (
        <PinModal
          action='unlock_app'
          actionLabel={tr('เปิดเมนูเบอร์โทรลับ', 'Open private contacts')}
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
