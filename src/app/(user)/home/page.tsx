'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowRight, BellRing, BookText, KeyRound, Laptop2, LifeBuoy, Megaphone, ShieldAlert, ShieldCheck, Smartphone, UsersRound, Wifi, X } from 'lucide-react';
import { TopQuickActions } from '@/components/layout/top-quick-actions';
import { useI18n } from '@/i18n/provider';
import { versionLabel } from '@/lib/app-version';
import { UPDATE_DETAILS_PATH } from '@/lib/release-update';

const LOGO_URL = '/icons/vault-logo.png';
const NOTICE_READ_STORAGE_KEY = 'pv_home_notice_read_v1';

type HomeRiskState = {
 ok?: boolean;
 active?: boolean;
 policy?: {
 severity?: 'low' | 'medium' | 'high' | 'critical';
 score?: number;
 actions?: string[];
 } | null;
 latestAssessment?: {
 severity?: 'low' | 'medium' | 'high' | 'critical' | string;
 score?: number;
 } | null;
};

type HomeRiskActionKind = 'safe_mode' | 'reauth' | 'sync_review' | null;

function clamp(value: number, min: number, max: number) {
 return Math.max(min, Math.min(max, value));
}

function formatStorage(bytes: number) {
 const gb = bytes / (1024 * 1024 * 1024);
 if (gb >= 1) return String(gb.toFixed(2)) + ' GB';
 const mb = bytes / (1024 * 1024);
 if (mb >= 1) return String(mb.toFixed(2)) + ' MB';
 const kb = bytes / 1024;
 if (kb >= 1) return String(kb.toFixed(2)) + ' KB';
 return String(Math.max(0, Math.floor(bytes))) + ' B';
}

function toRiskActionLabel(action: string, locale: 'th' | 'en') {
 if (action === 'notify_user') return locale === 'th' ? 'แจ้งเตือนผู้ใช้' : 'Notify user';
 if (action === 'limit_sensitive_actions') return locale === 'th' ? 'จำกัดฟังก์ชันสำคัญ' : 'Limit sensitive actions';
 if (action === 'force_reauth') return locale === 'th' ? 'บังคับยืนยันตัวตนใหม่' : 'Force re-authentication';
 if (action === 'suggest_uninstall_risky_apps') return locale === 'th' ? 'แนะนำให้ถอนแอปเสี่ยง' : 'Suggest uninstall risky apps';
 if (action === 'block_sync') return locale === 'th' ? 'บล็อกการซิงก์' : 'Block sync';
 if (action === 'block_sensitive_data') return locale === 'th' ? 'บล็อกข้อมูลอ่อนไหว' : 'Block sensitive data';
 if (action === 'lock_vault_temporarily') return locale === 'th' ? 'ล็อก Vault ชั่วคราว' : 'Temporarily lock Vault';
 return action;
}

function resolvePrimaryRiskAction(actions: string[]): HomeRiskActionKind {
 if (actions.includes('lock_vault_temporarily')) return 'safe_mode';
 if (actions.includes('force_reauth')) return 'reauth';
 if (actions.includes('block_sync')) return 'sync_review';
 return null;
}

export default function HomePage() {
 const router = useRouter();
 const { locale } = useI18n();
 const isThai = locale === 'th';
 const [itemCount, setItemCount] = useState(0);
 const [noteCount, setNoteCount] = useState(0);
 const [teamKeyCount, setTeamKeyCount] = useState(0);
 const [storageUsedBytes, setStorageUsedBytes] = useState(0);
 const [securityScore, setSecurityScore] = useState(66);
 const [stabilityScore, setStabilityScore] = useState(84);
 const [showNoticePanel, setShowNoticePanel] = useState(false);
 const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
 const [riskState, setRiskState] = useState<HomeRiskState | null>(null);
 const [riskActionBusy, setRiskActionBusy] = useState(false);
 const [noticeRead, setNoticeRead] = useState(() => {
 if (typeof window === 'undefined') return false;
 return window.localStorage.getItem(NOTICE_READ_STORAGE_KEY) === '1';
 });

 useEffect(() => {
 let mounted = true;
 const controller = new AbortController();

 async function loadHomeSummary() {
 const [vaultResult, notesResult, teamRoomsResult, profileResult] = await Promise.allSettled([
 fetch('/api/vault?limit=1&page=1&includeStorage=1', { cache: 'no-store', signal: controller.signal }).then((res) => res.json()),
 fetch('/api/notes?limit=1&page=1', { cache: 'no-store', signal: controller.signal }).then((res) => res.json()),
 fetch('/api/team-rooms', { cache: 'no-store', signal: controller.signal }).then((res) => res.json()),
 fetch('/api/profile/me', { cache: 'no-store', signal: controller.signal }).then((res) => res.json()),
 ]);

 if (!mounted) return;

 if (vaultResult.status === 'fulfilled') {
 const vaultBody = vaultResult.value as { pagination?: { total?: number }; items?: unknown[]; storage?: { usedBytes?: number } };
 const count = Math.max(0, Number(vaultBody.pagination?.total ?? (Array.isArray(vaultBody.items) ? vaultBody.items.length : 0)));
 const usedBytes = Math.max(0, Number(vaultBody.storage?.usedBytes ?? 0));
 setItemCount(count);
 setStorageUsedBytes(usedBytes);
 setSecurityScore(Math.round(clamp(58 + (count > 0 ? 10 : 0), 35, 99)));
 }

 if (notesResult.status === 'fulfilled') {
 const notesBody = notesResult.value as { pagination?: { total?: number }; notes?: unknown[] };
 const total = Math.max(0, Number(notesBody.pagination?.total ?? (Array.isArray(notesBody.notes) ? notesBody.notes.length : 0)));
 setNoteCount(total);
 }

 if (teamRoomsResult.status === 'fulfilled') {
 const teamBody = teamRoomsResult.value as { rooms?: unknown[] };
 const total = Math.max(0, Number(Array.isArray(teamBody.rooms) ? teamBody.rooms.length : 0));
 setTeamKeyCount(total);
 }

 if (profileResult.status === 'fulfilled') {
 const profileBody = profileResult.value as { status?: string };
 const status = String(profileBody.status ?? 'active');
 setStabilityScore(status === 'approved' || status === 'active' ? 88 : 72);
 }
 }

 void loadHomeSummary();

 return () => {
 mounted = false;
 controller.abort();
 };
 }, []);

 useEffect(() => {
 if (typeof window === 'undefined') return;
 window.localStorage.setItem(NOTICE_READ_STORAGE_KEY, noticeRead ? '1' : '0');
 }, [noticeRead]);

 useEffect(() => {
 let mounted = true;
 const controller = new AbortController();

 async function loadRiskState() {
 const response = await fetch('/api/security/risk-state', {
 method: 'GET',
 cache: 'no-store',
 signal: controller.signal,
 }).catch(() => null);

 if (!mounted || !response) return;
 const body = (await response.json().catch(() => ({}))) as HomeRiskState;
 if (!response.ok) return;
 setRiskState(body);
 }

 void loadRiskState();

 return () => {
 mounted = false;
 controller.abort();
 };
 }, []);

 const securityLabel = useMemo(() => {
 if (locale === 'th') return securityScore > 79 ? '\u0e14\u0e35' : '\u0e1b\u0e32\u0e19\u0e01\u0e25\u0e32\u0e07';
 return securityScore > 79 ? 'Good' : 'Moderate';
 }, [locale, securityScore]);

 const roleText = locale === 'th' ? '\u0e1c\u0e39\u0e49\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b' : 'General User';
 const roleLabel = locale === 'th' ? '\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c: ' : 'Role: ';
 const versionText = versionLabel(locale);
 const storageSoftLimitBytes = 50 * 1024 * 1024;
 const storagePercent = clamp(Math.round((storageUsedBytes / storageSoftLimitBytes) * 100), 0, 100);
 const noticeItems = useMemo(() => {
 return [
 {
 id: 'system-update',
 title: locale === 'th' ? 'อัปเดตระบบพร้อมใช้งาน' : 'System update available',
 detail: locale === 'th' ? `ระบบกำลังทำงานบน ${versionText} และตรวจสอบอัปเดตอัตโนมัติ` : `Running on ${versionText} with automatic update checks`,
 href: UPDATE_DETAILS_PATH,
 },
 {
 id: 'security-news',
 title: locale === 'th' ? 'ข่าวสารความปลอดภัย' : 'Security news',
 detail: locale === 'th'
 ? `คะแนนความปลอดภัยล่าสุด ${securityScore} (${securityLabel})`
 : `Latest security score: ${securityScore} (${securityLabel})`,
 },
 {
 id: 'storage-news',
 title: locale === 'th' ? 'สถานะพื้นที่จัดเก็บ' : 'Storage status',
 detail: locale === 'th'
 ? `ใช้งานพื้นที่ไปแล้ว ${storagePercent}% ของโควต้าที่แนะนำ`
 : `You have used ${storagePercent}% of the recommended quota`,
 },
 ];
 }, [locale, securityLabel, securityScore, storagePercent, versionText]);
 const noticeUnreadCount = noticeRead ? 0 : noticeItems.length;
 const riskSeverity = String(riskState?.policy?.severity ?? riskState?.latestAssessment?.severity ?? 'low').toLowerCase();
 const riskScore = Number(riskState?.policy?.score ?? riskState?.latestAssessment?.score ?? 0);
 const riskActions = Array.isArray(riskState?.policy?.actions) ? riskState?.policy?.actions : [];
 const showRiskBanner = riskSeverity === 'high' || riskSeverity === 'critical';
 const primaryRiskAction = resolvePrimaryRiskAction(riskActions);
 const riskToneClass = riskSeverity === 'critical'
 ? 'border-rose-300 bg-rose-50 text-rose-800'
 : 'border-orange-300 bg-orange-50 text-orange-800';
 const riskTitle = riskSeverity === 'critical'
 ? (isThai ? 'ตรวจพบความเสี่ยงระดับวิกฤต' : 'Critical Risk Detected')
 : (isThai ? 'ตรวจพบความเสี่ยงระดับสูง' : 'High Risk Detected');
 const riskDetail = isThai
 ? `Vault Shield ประเมินเป็น ${riskSeverity.toUpperCase()} (คะแนน ${riskScore}) ระบบอาจจำกัดการเข้าถึงข้อมูลสำคัญจนกว่าจะแก้ไขความเสี่ยง`
 : `Vault Shield reports ${riskSeverity.toUpperCase()} risk (score ${riskScore}). Sensitive access may be restricted until remediation is completed.`;
 const riskActionSummary = riskActions.map((action) => toRiskActionLabel(action, locale)).join(', ');
 const primaryRiskActionLabel = primaryRiskAction === 'safe_mode'
 ? (isThai ? 'เปิด Safe Mode' : 'Open Safe Mode')
 : primaryRiskAction === 'reauth'
 ? (isThai ? 'ยืนยันตัวตนใหม่' : 'Re-auth now')
 : primaryRiskAction === 'sync_review'
 ? (isThai ? 'ตรวจสอบการซิงก์' : 'Review Sync')
 : null;

 async function handlePrimaryRiskAction() {
 if (!primaryRiskAction || riskActionBusy) return;
 setRiskActionBusy(true);
 try {
 if (primaryRiskAction === 'safe_mode') {
 router.push('/settings/risk-state?guide=1&safe=1');
 return;
 }

 if (primaryRiskAction === 'sync_review') {
 router.push('/settings/sync');
 return;
 }

 await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
 router.push('/login?risk=reauth');
 } finally {
 setRiskActionBusy(false);
 }
 }

 const connectedItems = useMemo(() => {
 return [
 {
 id: 'browser-tab',
 icon: Laptop2,
 title: locale === 'th' ? 'Browser Session' : 'Browser Session',
 shortLabel: locale === 'th' ? '\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c' : 'Browser',
 subtitle: locale === 'th' ? '\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c\u0e2b\u0e25\u0e31\u0e01 (Windows)' : 'Primary device (Windows)',
 status: locale === 'th' ? '\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d\u0e2d\u0e22\u0e39\u0e48' : 'Connected',
 detail: locale === 'th' ? '\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e1c\u0e48\u0e32\u0e19 Browser Tab \u0e1a\u0e19\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c\u0e2b\u0e25\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13' : 'Running on your primary browser tab session',
 tone: 'amber' as const,
 },
 {
 id: 'mobile-runtime',
 icon: Smartphone,
 title: locale === 'th' ? 'Mobile Runtime' : 'Mobile Runtime',
 shortLabel: locale === 'th' ? '\u0e42\u0e21\u0e1a\u0e32\u0e22\u0e25\u0e4c' : 'Mobile',
 subtitle: locale === 'th' ? '\u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a PWA \u0e41\u0e25\u0e49\u0e27' : 'PWA mode is available',
 status: locale === 'th' ? '\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19' : 'Ready',
 detail: locale === 'th' ? '\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e40\u0e1b\u0e34\u0e14\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e41\u0e1a\u0e1a PWA \u0e1a\u0e19\u0e21\u0e37\u0e2d\u0e16\u0e37\u0e2d\u0e44\u0e14\u0e49' : 'Mobile runtime is ready for PWA usage',
 tone: 'emerald' as const,
 },
 {
 id: 'network-state',
 icon: Wifi,
 title: locale === 'th' ? '\u0e04\u0e38\u0e13\u0e20\u0e32\u0e1e\u0e40\u0e04\u0e23\u0e37\u0e2d\u0e02\u0e48\u0e32\u0e22' : 'Network quality',
 shortLabel: locale === 'th' ? '\u0e40\u0e04\u0e23\u0e37\u0e2d\u0e02\u0e48\u0e32\u0e22' : 'Network',
 subtitle: locale === 'th' ? '\u0e2d\u0e31\u0e15\u0e40\u0e14\u0e15\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34\u0e17\u0e38\u0e01 90 \u0e27\u0e34\u0e19\u0e32\u0e17\u0e35' : 'Auto checks every 90s',
 status: locale === 'th' ? '\u0e40\u0e2a\u0e16\u0e35\u0e22\u0e23' : 'Stable',
 detail: locale === 'th' ? '\u0e23\u0e30\u0e1a\u0e1a\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e04\u0e38\u0e13\u0e20\u0e32\u0e1e\u0e01\u0e32\u0e23\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d\u0e40\u0e1b\u0e47\u0e19\u0e23\u0e30\u0e22\u0e30' : 'Connection quality is monitored periodically',
 tone: 'cyan' as const,
 },
 ];
 }, [locale]);

 const activeConnection = useMemo(
 () => connectedItems.find((item) => item.id === activeConnectionId) ?? null,
 [activeConnectionId, connectedItems],
 );

 return (
 <section className='space-y-4 pb-24 pt-2'>
 <div className='px-2 py-2'>
 <div className='flex items-center gap-3'>
 <Image
 src={LOGO_URL}
 alt='Vault Logo'
 width={56}
 height={56}
 priority
 sizes='56px'
 className='h-14 w-14 rounded-2xl object-cover shadow-[0_8px_18px_rgba(79,123,255,0.22)]'
 />
 <div className='min-w-0'>
 <h1 className='truncate text-[27px] font-semibold leading-8 text-slate-800'>Vault</h1>
 <p className='mt-0.5 text-[13px] leading-5 text-slate-500'>{versionText}</p>
 <p className='text-[13px] leading-5 text-slate-500'>{roleLabel + roleText}</p>
 </div>
 </div>
 </div>

 {showRiskBanner ? (
 <div className={`rounded-[20px] border px-4 py-3 ${riskToneClass}`} role='status' aria-live='polite'>
 <div className='flex items-start justify-between gap-3'>
 <div className='min-w-0'>
 <p className='inline-flex items-center gap-2 text-sm font-semibold'>
 <ShieldAlert className='h-4 w-4' />
 {riskTitle}
 </p>
 <p className='mt-1 text-xs leading-5'>
 {riskDetail}
 </p>
 {riskActions.length > 0 ? (
 <p className='mt-2 text-[11px] leading-5 opacity-90'>
 {isThai ? 'มาตรการที่กำลังบังคับใช้:' : 'Active actions:'} {riskActionSummary}
 </p>
 ) : null}
 </div>
 <div className='flex shrink-0 flex-col items-stretch gap-2 sm:min-w-[190px]'>
 {primaryRiskActionLabel ? (
 <button
 type='button'
 onClick={() => void handlePrimaryRiskAction()}
 disabled={riskActionBusy}
 className='inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-current/30 bg-white px-3 text-[12px] font-semibold transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70'
 >
 {riskActionBusy ? (isThai ? 'กำลังดำเนินการ...' : 'Working...') : primaryRiskActionLabel}
 <ArrowRight className='h-3.5 w-3.5' />
 </button>
 ) : null}
 <button
 type='button'
 onClick={() => router.push('/settings/risk-state?guide=1')}
 className='inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-current/30 bg-white/80 px-3 text-[12px] font-semibold transition hover:bg-white'
 >
 {isThai ? 'แนวทางแก้ไขทันที' : 'One-click guidance'}
 <ArrowRight className='h-3.5 w-3.5' />
 </button>
 </div>
 </div>
 </div>
 ) : null}

 <div className='rounded-[24px] bg-white/70 px-2 py-2 backdrop-blur-sm'>
 <div className='grid grid-cols-2 gap-2'>
 <button
 type='button'
 onClick={() => {
 setNoticeRead(true);
 setShowNoticePanel(true);
 }}
 className='group relative flex min-h-[108px] flex-col items-center justify-center rounded-2xl border border-sky-100 bg-sky-50/70 px-2 py-2.5 text-center transition hover:border-sky-200 hover:bg-sky-50'
 >
 <span className='inline-flex rounded-2xl bg-white p-2.5 text-sky-700 shadow-[0_6px_14px_rgba(59,130,246,0.2)]'>
 <BellRing className='h-5 w-5 animate-pulse' />
 </span>
 <span className='mt-1.5 text-sm font-semibold text-slate-800'>{locale === 'th' ? '\u0e41\u0e08\u0e49\u0e07\u0e40\u0e15\u0e37\u0e2d\u0e19' : 'Notifications'}</span>
 <span className='text-[11px] text-slate-500'>{locale === 'th' ? '\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e23\u0e30\u0e1a\u0e1a' : 'System updates'}</span>
 {noticeUnreadCount > 0 ? (
 <span className='absolute right-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white'>{noticeUnreadCount}</span>
 ) : null}
 </button>

 <button
 type='button'
 onClick={() => router.push('/help-center')}
 className='group relative flex min-h-[108px] flex-col items-center justify-center rounded-2xl border border-violet-100 bg-violet-50/70 px-2 py-2.5 text-center transition hover:border-violet-200 hover:bg-violet-50'
 >
 <span className='inline-flex rounded-2xl bg-white p-2.5 text-violet-700 shadow-[0_6px_14px_rgba(124,58,237,0.18)]'>
 <LifeBuoy className='h-5 w-5' />
 </span>
 <span className='mt-1.5 text-sm font-semibold text-slate-800'>{locale === 'th' ? '\u0e28\u0e39\u0e19\u0e22\u0e4c\u0e0a\u0e48\u0e27\u0e22\u0e40\u0e2b\u0e25\u0e37\u0e2d' : 'Help center'}</span>
 <span className='text-[11px] text-slate-500'>{locale === 'th' ? 'FAQ \u2022 Ticket \u2022 \u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d\u0e41\u0e2d\u0e14\u0e21\u0e34\u0e19' : 'FAQ \u2022 Ticket \u2022 Contact admin'}</span>
 <span className='absolute right-2 top-2 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white'>
 {locale === 'th' ? '\u0e40\u0e02\u0e49\u0e32' : 'Open'}
 </span>
 </button>
 </div>

 <div className='mt-2 flex justify-end'>
 <TopQuickActions showRuntimeWhenNoUpdate={false} />
 </div>
 </div>

 <div className='rounded-[24px] bg-white/70 px-2 py-2 backdrop-blur-sm'>
 <div className='mb-2 flex items-center justify-between'>
 <h2 className='text-sm font-semibold text-slate-800'>{locale === 'th' ? '\u0e41\u0e2b\u0e25\u0e48\u0e07\u0e01\u0e32\u0e23\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d' : 'Connected sources'}</h2>
 <span className='inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700'>
 <ShieldCheck className='h-3 w-3' />
 {securityLabel}
 </span>
 </div>
 <div className='grid grid-cols-3 gap-2'>
 {connectedItems.map((item) => {
 const Icon = item.icon;
 const toneClass = item.tone === 'emerald'
 ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700'
 : item.tone === 'cyan'
 ? 'border-cyan-200 bg-cyan-50/70 text-cyan-700'
 : 'border-amber-200 bg-amber-50/70 text-amber-700';
 return (
 <button
 key={item.id}
 type='button'
 onClick={() => setActiveConnectionId(item.id)}
 className={'group flex h-[98px] flex-col items-center justify-center gap-1.5 rounded-[16px] border px-2 text-center transition active:scale-[0.98] ' + toneClass}
 >
 <span className='rounded-xl bg-white/85 p-2 shadow-[0_4px_10px_rgba(30,41,59,0.1)]'>
 <Icon className='h-4 w-4' />
 </span>
 <span className='text-[11px] font-semibold leading-4'>{item.shortLabel}</span>
 <span className='line-clamp-1 text-[10px] font-medium leading-4'>{item.status}</span>
 </button>
 );
 })}
 </div>
 </div>

 <div className='grid grid-cols-2 gap-3.5'>
 <div className='rounded-[22px] bg-white/75 px-3.5 py-3.5 backdrop-blur-sm'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e23\u0e30\u0e1a\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e16\u0e35\u0e22\u0e23' : 'System stability'}</p>
 <p className='mt-1 text-[33px] font-semibold leading-none text-slate-900'>{stabilityScore}/100</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '\u0e04\u0e48\u0e32\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e43\u0e19\u0e0a\u0e48\u0e27\u0e07\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14' : 'Latest reliability trend'}</p>
 <div className='mt-3 flex items-end gap-1.5'>
 {[26, 34, 57, 48, 42].map((value, index) => {
 const adjusted = clamp(value + Math.round((stabilityScore - 70) * 0.35), 18, 82);
 return <div key={index} className='w-4 rounded-sm bg-gradient-to-t from-emerald-300 to-cyan-300' style={{ height: String(adjusted) + 'px' }} />;
 })}
 </div>
 </div>

 <div className='rounded-[22px] bg-white/75 px-3.5 py-3.5 backdrop-blur-sm'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e08\u0e31\u0e14\u0e40\u0e01\u0e47\u0e1a' : 'Storage capacity'}</p>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{storagePercent}%</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '\u0e2a\u0e31\u0e14\u0e2a\u0e48\u0e27\u0e19\u0e08\u0e32\u0e01\u0e02\u0e35\u0e14\u0e08\u0e33\u0e01\u0e31\u0e14 50 MB' : 'Based on 50 MB soft limit'}</p>
 <div className='mt-3 h-2 rounded-full bg-slate-100'>
 <div
 className='h-2 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 transition-all'
 style={{ width: `${Math.max(storagePercent, storagePercent > 0 ? 8 : 0)}%` }}
 />
 </div>
 <p className='mt-2 text-xs text-slate-500'>{formatStorage(storageUsedBytes)}</p>
 </div>
 </div>

 <div className='grid grid-cols-3 gap-2.5'>
 <div className='rounded-[18px] bg-white/75 px-3 py-2.5 backdrop-blur-sm'>
 <div className='flex items-center gap-1.5 text-slate-600'>
 <KeyRound className='h-3.5 w-3.5' />
 <p className='text-[10px] font-semibold leading-4'>{locale === 'th' ? 'รหัสส่วนตัว' : 'Personal keys'}</p>
 </div>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{itemCount}</p>
 <p className='mt-1 text-[10px] leading-4 text-slate-500'>{locale === 'th' ? 'จำนวนรายการในคลัง' : 'Vault items'}</p>
 </div>

 <div className='rounded-[18px] bg-white/75 px-3 py-2.5 backdrop-blur-sm'>
 <div className='flex items-center gap-1.5 text-slate-600'>
 <BookText className='h-3.5 w-3.5' />
 <p className='text-[10px] font-semibold leading-4'>{locale === 'th' ? 'โน้ต' : 'Notes'}</p>
 </div>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{noteCount}</p>
 <p className='mt-1 text-[10px] leading-4 text-slate-500'>{locale === 'th' ? 'จำนวนรายการโน้ต' : 'Note entries'}</p>
 </div>

 <div className='rounded-[18px] bg-white/75 px-3 py-2.5 backdrop-blur-sm'>
 <div className='flex items-center gap-1.5 text-slate-600'>
 <UsersRound className='h-3.5 w-3.5' />
 <p className='text-[10px] font-semibold leading-4'>{locale === 'th' ? 'รหัสทีม' : 'Team keys'}</p>
 </div>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{teamKeyCount}</p>
 <p className='mt-1 text-[10px] leading-4 text-slate-500'>{locale === 'th' ? 'จำนวนห้องทีม' : 'Team rooms'}</p>
 </div>
 </div>

 {activeConnection ? (
 <div className='fixed inset-0 z-[110] flex items-center justify-center px-4' role='dialog' aria-modal='true'>
 <button
 type='button'
 className='absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]'
 aria-label={locale === 'th' ? '\u0e1b\u0e34\u0e14' : 'Close'}
 onClick={() => setActiveConnectionId(null)}
 />
 <div className='relative z-10 w-[min(92vw,380px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]'>
 <div className='flex items-start justify-between gap-3'>
 <div>
 <p className='text-base font-semibold text-slate-900'>{activeConnection.title}</p>
 <p className='mt-1 text-xs leading-5 text-slate-500'>{activeConnection.subtitle}</p>
 </div>
 <button
 type='button'
 className='rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700'
 onClick={() => setActiveConnectionId(null)}
 aria-label={locale === 'th' ? '\u0e1b\u0e34\u0e14' : 'Close'}
 >
 <X className='h-4 w-4' />
 </button>
 </div>

 <div className='mt-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-3'>
 <p className='text-xs font-semibold text-slate-700'>{locale === 'th' ? '\u0e2a\u0e16\u0e32\u0e19\u0e30' : 'Status'}</p>
 <p className='mt-1 text-sm font-semibold text-amber-600'>{activeConnection.status}</p>
 <p className='mt-2 text-xs leading-5 text-slate-600'>{activeConnection.detail}</p>
 </div>
 </div>
 </div>
 ) : null}

 {showNoticePanel ? (
 <div className='fixed inset-0 z-[111] flex items-center justify-center px-4' role='dialog' aria-modal='true'>
 <button
 type='button'
 className='absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]'
 aria-label={locale === 'th' ? '\u0e1b\u0e34\u0e14' : 'Close'}
 onClick={() => setShowNoticePanel(false)}
 />
 <div className='relative z-10 w-[min(92vw,420px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]'>
 <div className='flex items-start justify-between gap-3'>
 <div className='inline-flex items-center gap-2'>
 <span className='rounded-xl bg-sky-100 p-2 text-sky-700'>
 <Megaphone className='h-4 w-4' />
 </span>
 <p className='text-base font-semibold text-slate-900'>{locale === 'th' ? 'รายการแจ้งเตือนทั้งหมด' : 'All notifications'}</p>
 </div>
 <button
 type='button'
 className='rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700'
 onClick={() => setShowNoticePanel(false)}
 aria-label={locale === 'th' ? '\u0e1b\u0e34\u0e14' : 'Close'}
 >
 <X className='h-4 w-4' />
 </button>
 </div>

 <div className='mt-3 space-y-2'>
 {noticeItems.map((item) => (
 <div key={item.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2.5'>
 <p className='text-sm font-semibold text-slate-800'>{item.title}</p>
 <p className='mt-1 text-xs leading-5 text-slate-600'>{item.detail}</p>
 {item.href ? (
 <button
 type='button'
 className='mt-2 text-xs font-semibold text-blue-700 underline underline-offset-4'
 onClick={() => {
 setShowNoticePanel(false);
 router.push(item.href);
 }}
 >
 {locale === 'th' ? 'ดูรายละเอียดอัปเดต' : 'View update details'}
 </button>
 ) : null}
 </div>
 ))}
 </div>
 </div>
 </div>
 ) : null}

 </section>
 );
}


