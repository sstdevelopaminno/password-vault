'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Bell, ChevronRight, Download, Phone, ReceiptText, ShieldCheck, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PinModal } from '@/components/vault/pin-modal';
import { APP_VERSION } from '@/lib/app-version';
import {
  compareReleaseByCodeOrVersion,
  getDefaultAndroidReleasePayload,
  type AndroidApkRelease,
} from '@/lib/android-apk-release';
import { BRAND_LOGO_URL } from '@/lib/brand-logo';
import { useI18n } from '@/i18n/provider';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';

type VersionResponse = {
  appVersion?: string;
};

type ProfileResponse = {
  role?: string;
  status?: string;
};

type AndroidReleaseApiPayload = {
  ok?: boolean;
  release?: AndroidApkRelease;
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
  const runtime = detectRuntimeCapabilities();
  const router = useRouter();
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [userRole, setUserRole] = useState('user');
  const [userStatus, setUserStatus] = useState('active');
  const [pendingProtectedHref, setPendingProtectedHref] = useState<string | null>(null);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showAndroidInstallCta, setShowAndroidInstallCta] = useState(false);
  const [androidDownloadUrl, setAndroidDownloadUrl] = useState(getDefaultAndroidReleasePayload().release.downloadUrl);
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

  useEffect(() => {
    let active = true;

    async function decideAndroidInstallVisibility() {
      const isAndroidRuntime = runtime.isAndroid && !runtime.isIos;
      if (!isAndroidRuntime) {
        if (!active) return;
        setShowAndroidInstallCta(false);
        return;
      }

      const fallback = getDefaultAndroidReleasePayload().release;
      let release = fallback;
      try {
        const response = await fetch('/api/android-release', { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as AndroidReleaseApiPayload;
        if (response.ok && body.release?.versionName) {
          release = body.release;
        }
      } catch {
        // use fallback release
      }

      if (!active) return;
      setAndroidDownloadUrl(release.downloadUrl || fallback.downloadUrl);

      if (!runtime.isCapacitorNative) {
        setShowAndroidInstallCta(true);
        return;
      }

      let installedVersionName = APP_VERSION.replace(/^V/i, '');
      let installedVersionCode: number | null = null;

      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        installedVersionName = String(info.version ?? installedVersionName).trim() || installedVersionName;
        const parsedCode = Number(String(info.build ?? '').trim());
        installedVersionCode = Number.isFinite(parsedCode) && parsedCode > 0 ? Math.floor(parsedCode) : null;
      } catch {
        // keep fallback installed version
      }

      if (!active) return;

      const compareResult = compareReleaseByCodeOrVersion({
        installedVersionName,
        installedVersionCode,
        releaseVersionName: release.versionName,
        releaseVersionCode: release.versionCode,
      });

      setShowAndroidInstallCta(compareResult < 0);
    }

    void decideAndroidInstallVisibility();

    return () => {
      active = false;
    };
  }, [runtime.isAndroid, runtime.isCapacitorNative, runtime.isIos]);

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

      {showAndroidInstallCta ? (
        <div className='neon-soft-panel mt-2 flex items-center justify-between gap-2 rounded-[18px] p-2.5'>
          <Button
            type='button'
            variant='default'
            className='h-10 min-w-0 flex-1 rounded-xl px-3 text-app-caption'
            onClick={() => {
              if (!androidDownloadUrl) return;
              window.location.assign(androidDownloadUrl);
            }}
          >
            <span className='inline-flex items-center gap-2'>
              <Smartphone className='h-4 w-4' />
              <Download className='h-4 w-4' />
              {tr('ติดตั้งแอป Android', 'Install Android App')}
            </span>
          </Button>
          <Button
            type='button'
            variant='secondary'
            className='h-10 rounded-xl px-3 text-app-caption'
            onClick={() => setShowAndroidGuide(true)}
          >
            {tr('รายละเอียด', 'Details')}
          </Button>
        </div>
      ) : null}

      {showAndroidGuide ? (
        <div className='fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-3'>
          <div className='w-full max-w-md rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-1)] p-4 shadow-[0_28px_72px_rgba(5,12,35,0.6)] backdrop-blur'>
            <div className='mb-2 flex items-start justify-between gap-2'>
              <h5 className='text-app-h3 font-semibold text-slate-100'>{tr('ติดตั้งแอป Android', 'Android Installation Guide')}</h5>
              <button
                type='button'
                onClick={() => setShowAndroidGuide(false)}
                className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-200'
                aria-label={tr('ปิด', 'Close')}
              >
                <X className='h-4 w-4' />
              </button>
            </div>

            <p className='text-app-caption leading-relaxed text-slate-200'>
              {tr(
                'รองรับ Android Native APK เพื่อความเร็วและเสถียรภาพที่สูงกว่าเว็บ ใช้งานแจ้งเตือนและฟีเจอร์ฝั่งอุปกรณ์ได้ครบกว่าเดิม',
                'Use the native Android APK for better speed, stability, and complete device-feature support.',
              )}
            </p>

            <ol className='mt-3 space-y-1.5 pl-5 text-app-body text-slate-200'>
              <li>{tr('กดปุ่ม "ติดตั้งแอป Android"', 'Tap "Install Android App".')}</li>
              <li>{tr('รอไฟล์ APK ดาวน์โหลดจนเสร็จ', 'Wait for the APK to finish downloading.')}</li>
              <li>{tr('ระบบจะเปิดหน้าติดตั้ง ให้กด "ติดตั้ง"', 'The installer opens; tap "Install".')}</li>
              <li>{tr('ถ้ามีแจ้งเตือน Unknown Apps ให้อนุญาต แล้วกลับมาติดตั้งต่อ', 'If Unknown Apps permission is requested, allow it and continue.')}</li>
              <li>{tr('ติดตั้งเสร็จแล้วกด "เปิด" เพื่อใช้งาน', 'After installation, tap "Open".')}</li>
            </ol>

            <p className='mt-3 text-app-caption text-slate-300'>
              {tr('iOS ยังไม่รองรับในรอบนี้ (อยู่ในแผนพัฒนาถัดไป)', 'iOS is not supported in this round (planned next phase).')}
            </p>

            <div className='mt-3 overflow-hidden rounded-2xl border border-[var(--border-soft)]'>
              <Image
                src={ANDROID_PROMO_IMAGE_URL}
                alt={tr('ภาพตัวอย่างแอป Android', 'Android app preview')}
                width={1280}
                height={720}
                className='h-auto w-full object-cover'
              />
            </div>
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
