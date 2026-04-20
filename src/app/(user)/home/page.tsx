'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  ChevronRight,
  Database,
  HardDrive,
  PhoneCall,
  Server,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import { readMobileContacts, type MobileContactsPermission } from '@/lib/mobile-contacts';
import { readMdmOverview, type MdmOverview } from '@/lib/mdm-client';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import { readPhoneProtectionEnabled, writePhoneProtectionEnabled } from '@/lib/phone-protection';
import { APP_VERSION } from '@/lib/app-version';

const FORCE_ANDROID_INSTALL_POPUP_EVENT = 'pv:force-android-install-popup';

type AlertsResponse = {
  alerts: Array<{
    id: string;
    number: string;
    level: 'safe' | 'suspicious' | 'high_risk';
    message: string;
  }>;
  summary: {
    total: number;
    highRiskCount: number;
    suspiciousCount: number;
  };
};

type VersionResponse = {
  appVersion?: string;
};

type ProfileResponse = {
  fullName?: string;
  role?: string;
  status?: string;
};

type TipSubmitResponse = {
  ok?: boolean;
  riskLevel?: string;
  workflowStatus?: string;
  error?: string;
};

function mdmTone(state: MdmOverview['complianceState']) {
  if (state === 'compliant') return 'bg-emerald-50 text-emerald-700';
  if (state === 'at_risk') return 'bg-amber-50 text-amber-700';
  if (state === 'non_compliant') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function mdmLabel(state: MdmOverview['complianceState']) {
  if (state === 'compliant') return 'Compliant';
  if (state === 'at_risk') return 'At risk';
  if (state === 'non_compliant') return 'Non-compliant';
  return 'Unknown';
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, '').slice(0, 30);
}

const actionTiles = [
  { href: '/contacts', title: 'ผู้ติดต่อ', subtitle: 'รายชื่อมือถือ', icon: Smartphone },
  { href: '/dialer', title: 'โทรด่วน', subtitle: 'โทรออกทันที', icon: PhoneCall },
  { href: '/risk-check', title: 'ตรวจเบอร์', subtitle: 'AI Scan', icon: ShieldCheck },
  { href: '/risk-alerts', title: 'บล็อก/รายงาน', subtitle: 'เบอร์เสี่ยง', icon: ShieldX },
];

const ELEVATED_ROLES = new Set(['admin', 'super_admin', 'approver']);

export default function HomePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AlertsResponse['summary'] | null>(null);
  const [contactsCount, setContactsCount] = useState(0);
  const [, setContactsPermission] = useState<MobileContactsPermission>('unknown');
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [userRole, setUserRole] = useState('user');
  const [userStatus, setUserStatus] = useState('active');
  const [userFullName, setUserFullName] = useState('');
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIosRuntime] = useState(() => detectRuntimeCapabilities().isIos);
  const [phoneProtectionEnabled, setPhoneProtectionEnabled] = useState(() => readPhoneProtectionEnabled());
  const [mdmOverview, setMdmOverview] = useState<MdmOverview | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipNumber, setTipNumber] = useState('');
  const [tipClueText, setTipClueText] = useState('');
  const [tipLoading, setTipLoading] = useState(false);
  const [tipStatus, setTipStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const canViewMdmStatus = ELEVATED_ROLES.has(userRole);

  useEffect(() => {
    let ignore = false;
    fetch('/api/phone/risk-alerts', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: AlertsResponse | null) => {
        if (ignore || !payload) return;
        setSummary(payload.summary ?? null);
      })
      .catch(() => undefined);

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

    readMdmOverview()
      .then((overview) => {
        if (ignore) return;
        setMdmOverview(overview);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    readMobileContacts({ requestPermission: false, limit: 100 })
      .then((result) => {
        if (ignore) return;
        setContactsCount(result.contacts.length);
        setContactsPermission(result.permission);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  async function syncMobileContacts(requestPermission: boolean) {
    try {
      const result = await readMobileContacts({ requestPermission, limit: 300 });
      setContactsCount(result.contacts.length);
      setContactsPermission(result.permission);
    } catch {
      setContactsPermission('unknown');
    }
  }

  async function enablePhoneProtection() {
    const runtime = detectRuntimeCapabilities();
    const isAndroidWebRuntime = runtime.isAndroid && !runtime.isIos && !runtime.isCapacitorNative;
    if (isAndroidWebRuntime && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(FORCE_ANDROID_INSTALL_POPUP_EVENT));
      return;
    }

    writePhoneProtectionEnabled(true);
    setPhoneProtectionEnabled(true);
    await syncMobileContacts(true);
    router.push('/settings/risk-state?guide=1');
  }

  function gateAndroidPwaMenu(event: { preventDefault: () => void }) {
    const runtime = detectRuntimeCapabilities();
    const isAndroidWebRuntime = runtime.isAndroid && !runtime.isIos && !runtime.isCapacitorNative;
    if (!isAndroidWebRuntime || typeof window === 'undefined') return false;
    event.preventDefault();
    window.dispatchEvent(new Event(FORCE_ANDROID_INSTALL_POPUP_EVENT));
    return true;
  }

  async function submitRiskTipFromHome() {
    const number = normalizePhone(tipNumber);
    if (number.length < 6) {
      setTipStatus({ type: 'error', message: 'กรุณากรอกเบอร์อย่างน้อย 6 หลัก' });
      return;
    }
    if (tipClueText.trim().length < 2) {
      setTipStatus({ type: 'error', message: 'กรุณากรอกรายละเอียดอย่างน้อย 2 ตัวอักษร' });
      return;
    }

    setTipLoading(true);
    setTipStatus(null);
    try {
      const response = await fetch('/api/phone/risk-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          action: 'report',
          clueText: tipClueText.trim(),
          source: 'home_quick_action',
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as TipSubmitResponse;
      if (!response.ok) {
        setTipStatus({ type: 'error', message: String(payload.error ?? 'ส่งเบาะแสไม่สำเร็จ') });
        return;
      }

      setTipNumber('');
      setTipClueText('');
      setTipStatus({
        type: 'success',
        message: `รับเบาะแสแล้ว (risk: ${String(payload.riskLevel ?? 'unknown')})`,
      });

      const summaryResponse = await fetch('/api/phone/risk-alerts', { cache: 'no-store' });
      const summaryPayload = (await summaryResponse.json().catch(() => null)) as AlertsResponse | null;
      if (summaryResponse.ok && summaryPayload?.summary) {
        setSummary(summaryPayload.summary);
      }
    } finally {
      setTipLoading(false);
    }
  }

  return (
    <section className='relative space-y-3 pb-20 pt-[max(10px,env(safe-area-inset-top))]'>
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <Image src='/icons/vault-logo.png' alt='Vault Logo' width={48} height={48} className='h-12 w-12 rounded-2xl object-cover' priority />
          <div className='min-w-0'>
            <h1 className='text-2xl font-semibold text-slate-900'>Vault</h1>
            <p className='text-xs text-slate-500'>{appVersion}</p>
            <p className='text-xs text-slate-500'>Premium Security</p>
            <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
              <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>สิทธิ์: {userRole}</span>
              <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700'>สถานะ: {userStatus}</span>
              {canViewMdmStatus ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${mdmTone(mdmOverview?.complianceState ?? 'unknown')}`}>
                  MDM: {mdmLabel(mdmOverview?.complianceState ?? 'unknown')}
                </span>
              ) : null}
              {userFullName ? <span className='truncate text-[11px] text-slate-500'>{userFullName}</span> : null}
            </div>
          </div>
        </div>
        <Link href='/risk-alerts' onClick={gateAndroidPwaMenu} className='rounded-xl bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200' aria-label='แจ้งเตือน'>
          <Bell className='h-4 w-4' />
        </Link>
      </div>

        <div className='mb-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-3'>
          <h2 className='text-sm font-semibold text-slate-900'>Premium Protection</h2>
          <p className='mt-1 text-xs text-slate-600'>ปกป้องรหัสผ่าน การโทร และข้อมูลส่วนตัว</p>

          <Link href='/risk-check' onClick={gateAndroidPwaMenu} className='mt-3 flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 transition hover:border-blue-300 hover:text-slate-700'>
            <span>ค้นหาเบอร์/ชื่อผู้ติดต่อ</span>
            <ChevronRight className='h-4 w-4' />
          </Link>

          <div className='mt-3 flex flex-wrap gap-2'>
            <span className='rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600'>คะแนนระบบ</span>
            <span className='rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700'>เบอร์เสี่ยง {summary?.highRiskCount ?? 0}</span>
            <span className='rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600'>ผู้ติดต่อ {contactsCount}</span>
          </div>
        </div>

        <div className='mb-3 grid grid-cols-2 gap-2'>
          {actionTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.href} href={tile.href} onClick={gateAndroidPwaMenu} className='rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-300 hover:shadow-sm'>
                <div className='mb-2 inline-flex rounded-lg bg-blue-50 p-2 text-blue-600'>
                  <Icon className='h-4 w-4' />
                </div>
                <p className='text-sm font-semibold text-slate-900'>{tile.title}</p>
                <p className='text-xs text-slate-500'>{tile.subtitle}</p>
              </Link>
            );
          })}
        </div>

        {!phoneProtectionEnabled ? (
          <div className='mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3'>
            <h3 className='text-sm font-semibold text-emerald-900'>Phone Protection</h3>
            <p className='mt-1 text-xs leading-5 text-emerald-800'>ระบบเฝ้าระวังการโทรหลอกลวง พบเบอร์ต้องสงสัยจะแจ้งเตือน</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              <button type='button' onClick={() => void enablePhoneProtection()} className='inline-flex h-9 items-center rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700'>
                เปิดใช้ระบบ
              </button>
              {isIosRuntime ? (
                <button type='button' onClick={() => setShowIosGuide(true)} className='inline-flex h-9 items-center rounded-xl border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700'>
                  สถานะ iOS
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className='mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3'>
          <h3 className='text-sm font-semibold text-rose-900'>แจ้งเบาะแสเบอร์มิจฉาชีพ</h3>
          <p className='mt-1 text-xs leading-5 text-rose-800'>แจ้งเบอร์ต้องสงสัยได้ทันทีจากหน้าแรก พร้อมแนบรายละเอียดประกอบ</p>
          <div className='mt-2'>
            <button
              type='button'
              onClick={() => setShowTipModal(true)}
              className='inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700'
            >
              <Send className='h-4 w-4' />
              แจ้งเบาะแสเบอร์มิจฉาชีพ
            </button>
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

      <Link
        href='/dialer'
        onClick={gateAndroidPwaMenu}
        className='fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-50 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(37,99,235,0.35)] transition hover:opacity-95'
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
                <p className='text-base font-semibold text-slate-900'>ระบบยังไม่รองรับเวอร์ชัน iOS</p>
                <p className='mt-1 text-xs leading-5 text-slate-600'>ขณะนี้ฟีเจอร์หลักบางส่วนยังไม่รองรับบน iOS กรุณาใช้งานผ่าน Android App เพื่อความเสถียรสูงสุด</p>
              </div>
              <button type='button' onClick={() => setShowIosGuide(false)} className='rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700' aria-label='ปิด'>
                <X className='h-4 w-4' />
              </button>
            </div>

            <div className='mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700'>
              แนะนำติดตั้งแอป Android เวอร์ชันล่าสุดเพื่อใช้งานสิทธิ์รายชื่อและโทรออกได้เต็มระบบ
            </div>
          </div>
        </div>
      ) : null}

      {showTipModal ? (
        <div className='fixed inset-0 z-[130] flex items-center justify-center px-4' role='dialog' aria-modal='true'>
          <button type='button' className='absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]' onClick={() => setShowTipModal(false)} aria-label='ปิด' />
          <div className='relative z-10 w-[min(92vw,480px)] rounded-3xl border border-rose-200 bg-rose-50 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]'>
            <div className='mb-2 flex items-start justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold text-rose-900'>แจ้งเบาะแสเบอร์มิจฉาชีพ</h3>
                <p className='mt-1 text-xs leading-5 text-rose-800'>แจ้งเบอร์ต้องสงสัยได้ทันทีจากหน้าแรก พร้อมแนบรายละเอียดประกอบ</p>
              </div>
              <button
                type='button'
                onClick={() => setShowTipModal(false)}
                className='rounded-lg p-1 text-slate-500 transition hover:bg-white hover:text-slate-700'
                aria-label='ปิด'
              >
                <X className='h-4 w-4' />
              </button>
            </div>
            <div className='space-y-2'>
              <input
                type='tel'
                value={tipNumber}
                onChange={(event) => setTipNumber(event.target.value)}
                placeholder='เบอร์ต้องสงสัย เช่น 08x-xxx-xxxx'
                className='h-10 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-rose-400'
              />
              <textarea
                value={tipClueText}
                onChange={(event) => setTipClueText(event.target.value)}
                placeholder='รายละเอียด เช่น อ้างเป็นเจ้าหน้าที่ ขอ OTP หรือขอให้โอนเงิน'
                rows={3}
                className='w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-400'
              />
              <div className='flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={() => void submitRiskTipFromHome()}
                  disabled={tipLoading}
                  className='inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60'
                >
                  <Send className='h-3.5 w-3.5' />
                  {tipLoading ? 'กำลังส่ง...' : 'ส่งเบาะแส'}
                </button>
                <Link
                  href='/risk-tip'
                  onClick={gateAndroidPwaMenu}
                  className='inline-flex h-9 items-center rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100'
                >
                  ดูรายการทั้งหมด
                </Link>
              </div>
              {tipStatus ? (
                <p className={`text-xs ${tipStatus.type === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>{tipStatus.message}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
