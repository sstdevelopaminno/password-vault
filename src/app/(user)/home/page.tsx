'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Bell, Calculator, Calendar, ChevronLeft, ChevronRight, Cloud, Download, Package, PackageCheck, Phone, ReceiptText, ScanText, ShieldCheck, Smartphone, WalletCards, X } from 'lucide-react';
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
import { UPDATE_DETAILS_PATH, markReleaseNotesAsRead, shouldShowReleaseNotesBadge } from '@/lib/release-update';

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
  titleKey:
    | 'nav.privateContacts'
    | 'nav.billing'
    | 'nav.calculator'
    | 'nav.cloudFiles'
    | 'nav.documentScanner';
  icon: typeof Phone;
  iconClass: string;
  requiresPin?: boolean;
};

type ServiceTile = {
  href: string;
  titleKey: 'nav.packageCheck' | 'nav.ourPackages' | 'nav.wallet';
  icon: typeof PackageCheck;
  iconClass: string;
};

type HomeCalendarNote = {
  id: string;
  title: string;
  content?: string;
  reminderAt: string | null;
  meetingAt: string | null;
  updatedAt?: string;
};

function dateKeyFromIso(raw: string | null | undefined) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

const actionTiles: ActionTile[] = [
  {
    href: '/private-contacts',
    titleKey: 'nav.privateContacts',
    icon: Phone,
    iconClass: 'text-cyan-300',
    requiresPin: true,
  },
  {
    href: '/billing',
    titleKey: 'nav.billing',
    icon: ReceiptText,
    iconClass: 'text-emerald-300',
  },
  {
    href: '/calculator',
    titleKey: 'nav.calculator',
    icon: Calculator,
    iconClass: 'text-violet-300',
  },
  {
    href: '/workspace-cloud',
    titleKey: 'nav.cloudFiles',
    icon: Cloud,
    iconClass: 'text-cyan-300',
  },
  {
    href: '/document-scanner',
    titleKey: 'nav.documentScanner',
    icon: ScanText,
    iconClass: 'text-pink-300',
  },
];

const serviceTiles: ServiceTile[] = [
  {
    href: '/package-check',
    titleKey: 'nav.packageCheck',
    icon: PackageCheck,
    iconClass: 'text-sky-300',
  },
  {
    href: '/our-packages',
    titleKey: 'nav.ourPackages',
    icon: Package,
    iconClass: 'text-fuchsia-300',
  },
  {
    href: '/wallet',
    titleKey: 'nav.wallet',
    icon: WalletCards,
    iconClass: 'text-amber-300',
  },
];

const ANDROID_PROMO_IMAGE_URL =
  'https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/256922.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzI1NjkyMi5wbmciLCJpYXQiOjE3NzcwMDM3NzcsImV4cCI6MTgwODUzOTc3N30.0ngVxtTqFUbis4DF8j7FJ2d4wfpoXXzcPAxVvzhmBb4';
const HOME_BANNER_IMAGE_URL =
  'https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/5587799.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzU1ODc3OTkucG5nIiwiaWF0IjoxNzc3MDgzMTIyLCJleHAiOjE4MDg2MTkxMjJ9.63oigSLqpOeKil9QOLDxZn0hlaJqwWk6A-OdAF6ccvQ';

export default function HomePage() {
  const { locale, t } = useI18n();
  const runtime = detectRuntimeCapabilities();
  const router = useRouter();
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [userRole, setUserRole] = useState('user');
  const [userStatus, setUserStatus] = useState('active');
  const [pendingProtectedHref, setPendingProtectedHref] = useState<string | null>(null);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showAndroidInstallCta, setShowAndroidInstallCta] = useState(false);
  const [androidDownloadUrl, setAndroidDownloadUrl] = useState(getDefaultAndroidReleasePayload().release.downloadUrl);
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [calendarNotes, setCalendarNotes] = useState<HomeCalendarNote[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarLoadError, setCalendarLoadError] = useState('');
  const [showReleaseBadge, setShowReleaseBadge] = useState(false);
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarSelectedDateKey, setCalendarSelectedDateKey] = useState(() => dateKeyFromIso(new Date().toISOString()) ?? '');
  const isThai = locale === 'th';
  const tr = useCallback((th: string, en: string) => (isThai ? th : en), [isThai]);
  const weekLabels = isThai ? ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const calendarMonthLabel = useMemo(
    () =>
      calendarMonthCursor.toLocaleDateString(isThai ? 'th-TH' : 'en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonthCursor, isThai],
  );

  const calendarCells = useMemo(() => {
    const year = calendarMonthCursor.getFullYear();
    const month = calendarMonthCursor.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonthCursor]);

  const dateCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of calendarNotes) {
      const meetingKey = dateKeyFromIso(note.meetingAt);
      const reminderKey = dateKeyFromIso(note.reminderAt);
      if (meetingKey) map.set(meetingKey, (map.get(meetingKey) ?? 0) + 1);
      if (reminderKey && reminderKey !== meetingKey) map.set(reminderKey, (map.get(reminderKey) ?? 0) + 1);
    }
    return map;
  }, [calendarNotes]);

  const notesByDate = useMemo(() => {
    const buckets = new Map<string, Map<string, HomeCalendarNote>>();
    const addToBucket = (dateKey: string | null, note: HomeCalendarNote) => {
      if (!dateKey) return;
      const existing = buckets.get(dateKey);
      if (existing) {
        existing.set(note.id, note);
        return;
      }
      const next = new Map<string, HomeCalendarNote>();
      next.set(note.id, note);
      buckets.set(dateKey, next);
    };

    for (const note of calendarNotes) {
      addToBucket(dateKeyFromIso(note.meetingAt), note);
      addToBucket(dateKeyFromIso(note.reminderAt), note);
    }

    const normalized = new Map<string, HomeCalendarNote[]>();
    for (const [dateKey, bucket] of buckets) {
      normalized.set(dateKey, Array.from(bucket.values()));
    }
    return normalized;
  }, [calendarNotes]);

  const selectedDateNotes = useMemo(() => notesByDate.get(calendarSelectedDateKey) ?? [], [calendarSelectedDateKey, notesByDate]);

  const loadCalendarNotes = useCallback(async () => {
    setCalendarLoading(true);
    setCalendarLoadError('');
    try {
      const params = new URLSearchParams({ page: '1', limit: '180', view: 'calendar' });
      const response = await fetch('/api/notes?' + params.toString(), { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { error?: string; notes?: HomeCalendarNote[] };
      if (!response.ok) {
        setCalendarLoadError(body.error || tr('โหลดปฏิทินไม่สำเร็จ', 'Failed to load calendar'));
        setCalendarNotes([]);
        return;
      }
      setCalendarNotes(Array.isArray(body.notes) ? body.notes : []);
    } catch {
      setCalendarLoadError(tr('โหลดปฏิทินไม่สำเร็จ', 'Failed to load calendar'));
      setCalendarNotes([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [tr]);

  function openCalendarPopup() {
    setShowCalendarPopup(true);
    void loadCalendarNotes();
  }

  const syncReleaseBadge = useCallback(() => {
    setShowReleaseBadge(shouldShowReleaseNotesBadge(appVersion));
  }, [appVersion]);

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

  useEffect(() => {
    syncReleaseBadge();
    if (typeof window === 'undefined') return;

    const refreshOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      syncReleaseBadge();
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [syncReleaseBadge]);

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
          href={UPDATE_DETAILS_PATH}
          onClick={() => {
            markReleaseNotesAsRead(appVersion);
            setShowReleaseBadge(false);
          }}
          className='relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-100 shadow-[var(--glow-soft)]'
          aria-label={showReleaseBadge ? 'Notifications (new update)' : 'Notifications'}
        >
          <Bell className={'h-5 w-5 ' + (showReleaseBadge ? 'animate-bell-bounce' : '')} />
          {showReleaseBadge ? (
            <span className='absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(251,113,133,0.75)] animate-pulse' />
          ) : null}
        </Link>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <span className='neon-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-app-caption font-semibold'>
          <ShieldCheck className='h-3.5 w-3.5' />
          {t('home.roleLabel')}: {userRole}
        </span>
        <span className='neon-chip neon-chip-active inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-app-caption font-semibold'>
          <Activity className='h-3.5 w-3.5' />
          {t('home.statusLabel')}: {userStatus}
        </span>
      </div>

      <div className='space-y-2.5'>
        <div className='grid grid-cols-3 gap-2'>
          {actionTiles.slice(0, 3).map((tile) => {
            const Icon = tile.icon;
            const tileBody = (
              <>
                <Icon className='h-[22px] w-[22px] text-slate-100' />
                <p className='line-clamp-2 text-[12px] font-semibold leading-tight text-slate-100'>{t(tile.titleKey)}</p>
              </>
            );

            if (tile.requiresPin) {
              return (
                <button
                  key={tile.href}
                  type='button'
                  onClick={() => setPendingProtectedHref(tile.href)}
                  className='neon-panel group flex min-h-[90px] w-full flex-col items-center justify-center gap-1.5 rounded-[12px] px-1.5 py-2 text-center'
                >
                  {tileBody}
                </button>
              );
            }

            return (
              <Link
                key={tile.href}
                href={tile.href}
                className='neon-panel group flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-[12px] px-1.5 py-2 text-center'
              >
                {tileBody}
              </Link>
            );
          })}
        </div>

        <div className='grid grid-cols-3 gap-2.5'>
          {actionTiles.slice(3).map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.href}
                href={tile.href}
                className='neon-panel group flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-[12px] px-1.5 py-2 text-center'
                aria-label={t(tile.titleKey)}
              >
                <Icon className={'h-[22px] w-[22px] ' + tile.iconClass} />
                <p className='line-clamp-2 text-[12px] font-semibold leading-tight text-slate-100'>{t(tile.titleKey)}</p>
              </Link>
            );
          })}

          <button
            type='button'
            onClick={openCalendarPopup}
            className='neon-panel group flex min-h-[90px] w-full flex-col items-center justify-center gap-1.5 rounded-[12px] px-1.5 py-2 text-center'
            aria-label={t('nav.calendar')}
          >
            <Calendar className='h-[22px] w-[22px] text-amber-300' />
            <p className='line-clamp-2 text-[12px] font-semibold leading-tight text-slate-100'>{t('nav.calendar')}</p>
          </button>
        </div>

        <div className='grid grid-cols-3 gap-2'>
          {serviceTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.href}
                href={tile.href}
                className='group flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[12px] text-center'
                aria-label={t(tile.titleKey)}
              >
                <Icon className={'h-[24px] w-[24px] ' + tile.iconClass} />
                <p className='line-clamp-2 text-[12px] font-semibold leading-tight text-slate-100'>{t(tile.titleKey)}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className='overflow-hidden rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-[var(--glow-soft)]'>
        <Image
          src={HOME_BANNER_IMAGE_URL}
          alt={tr('แบนเนอร์ Vault', 'Vault banner')}
          width={1600}
          height={900}
          className='h-auto w-full object-cover'
          priority={false}
        />
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

      {showCalendarPopup ? (
        <div className='fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-[3px]'>
          <div className='w-full max-w-[430px] rounded-[24px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(25,56,113,0.55)_0%,rgba(6,16,60,0.92)_70%)] p-4 shadow-[0_28px_72px_rgba(5,12,35,0.65)]'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <button
                type='button'
                onClick={() => setCalendarMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
                aria-label={tr('เดือนก่อนหน้า', 'Previous month')}
              >
                <ChevronLeft className='h-4 w-4' />
              </button>
              <p className='text-app-body font-semibold text-slate-100'>{calendarMonthLabel}</p>
              <button
                type='button'
                onClick={() => setCalendarMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
                aria-label={tr('เดือนถัดไป', 'Next month')}
              >
                <ChevronRight className='h-4 w-4' />
              </button>
            </div>

            <div className='mb-1 grid grid-cols-7 gap-1 text-center text-app-micro font-semibold text-slate-300'>
              {weekLabels.map((item, index) => (
                <div key={item + String(index)}>{item}</div>
              ))}
            </div>
            <div className='grid grid-cols-7 gap-1.5'>
              {calendarCells.map((date, index) => {
                if (!date) return <div key={'calendar-empty-' + String(index)} className='h-11 rounded-xl border border-transparent' />;
                const key = dateKeyFromIso(date.toISOString()) ?? '';
                const active = key === calendarSelectedDateKey;
                const count = dateCountMap.get(key) ?? 0;
                return (
                  <button
                    key={key}
                    type='button'
                    onClick={() => setCalendarSelectedDateKey(key)}
                    className={
                      'relative h-11 rounded-xl border text-app-caption transition ' +
                      (active
                        ? 'border-sky-300 bg-[rgba(55,123,229,0.35)] text-slate-100'
                        : 'border-[rgba(111,165,255,0.5)] bg-[rgba(18,42,102,0.6)] text-slate-100 hover:border-sky-300')
                    }
                  >
                    {date.getDate()}
                    {count > 0 ? (
                      <span className='absolute right-1 top-1 inline-flex min-w-[15px] items-center justify-center rounded-full bg-sky-400 px-1 text-[10px] font-semibold leading-none text-slate-900'>
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className='mt-3 rounded-2xl border border-[var(--border-soft)] bg-[rgba(10,24,71,0.65)] p-2.5'>
              <p className='text-app-micro font-semibold text-slate-300'>
                {tr('รายการจากโน้ตวันที่', 'Notes on')} {calendarSelectedDateKey || '-'}
              </p>
              {calendarLoading ? <p className='mt-1 text-app-caption text-slate-300'>{tr('กำลังโหลด...', 'Loading...')}</p> : null}
              {!calendarLoading && calendarLoadError ? <p className='mt-1 text-app-caption text-rose-200'>{calendarLoadError}</p> : null}
              {!calendarLoading && !calendarLoadError && selectedDateNotes.length === 0 ? (
                <p className='mt-1 text-app-caption text-slate-300'>{tr('ไม่มีรายการนัด/เตือนในวันนี้', 'No note reminders on this date')}</p>
              ) : null}
              {!calendarLoading && !calendarLoadError && selectedDateNotes.length > 0 ? (
                <ul className='mt-1.5 space-y-1'>
                  {selectedDateNotes.slice(0, 4).map((note) => (
                    <li key={note.id} className='line-clamp-1 text-app-caption text-slate-100'>
                      • {note.title || tr('โน้ตไม่มีชื่อ', 'Untitled note')}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className='mt-3 flex justify-end'>
              <Button type='button' variant='secondary' className='h-10 rounded-xl px-4 text-app-caption' onClick={() => setShowCalendarPopup(false)}>
                {tr('ปิด', 'Close')}
              </Button>
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
