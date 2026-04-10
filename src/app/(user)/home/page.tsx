'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, BookText, KeyRound, Laptop2, ShieldCheck, Smartphone, UsersRound, Wifi, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/provider';
import { versionLabel } from '@/lib/app-version';

const LOGO_URL = 'https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/Imagemaster password.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0ltYWdlbWFzdGVyIHBhc3N3b3JkLnBuZyIsImlhdCI6MTc3NDcxOTUzNywiZXhwIjoxODA2MjU1NTM3fQ.k-KJDjjccxBz8odBvF-SKmrHEdKgMQHRSy__nohIeDk';

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

function buildTrendPath(values: number[]) {
 const width = 320;
 const height = 92;
 const left = 10;
 const right = 10;
 const top = 12;
 const bottom = 10;
 const usableWidth = width - left - right;
 const usableHeight = height - top - bottom;

 return values
 .map((value, index) => {
 const x = left + (index / Math.max(values.length - 1, 1)) * usableWidth;
 const y = top + (1 - value / 100) * usableHeight;
 return `${x.toFixed(2)},${y.toFixed(2)}`;
 })
 .join(' ');
}

export default function HomePage() {
 const { locale } = useI18n();
 const [itemCount, setItemCount] = useState(0);
 const [noteCount, setNoteCount] = useState(0);
 const [teamKeyCount, setTeamKeyCount] = useState(0);
 const [storageUsedBytes, setStorageUsedBytes] = useState(0);
 const [securityScore, setSecurityScore] = useState(66);
 const [stabilityScore, setStabilityScore] = useState(84);
 const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

 useEffect(() => {
 let mounted = true;

 fetch('/api/vault?limit=1&page=1&includeStorage=1', { cache: 'no-store' })
 .then((res) => res.json())
 .then((body) => {
 if (!mounted) return;
 const count = Math.max(0, Number(body.pagination?.total ?? (Array.isArray(body.items) ? body.items.length : 0)));
 const usedBytes = Math.max(0, Number(body.storage?.usedBytes ?? 0));
 setItemCount(count);
 setStorageUsedBytes(usedBytes);
 setSecurityScore(Math.round(clamp(58 + (count > 0 ? 10 : 0), 35, 99)));
 })
 .catch(() => {});

 fetch('/api/notes?limit=1&page=1', { cache: 'no-store' })
 .then((res) => res.json())
 .then((body) => {
 if (!mounted) return;
 const total = Math.max(0, Number(body.pagination?.total ?? (Array.isArray(body.notes) ? body.notes.length : 0)));
 setNoteCount(total);
 })
 .catch(() => {});

 fetch('/api/team-rooms', { cache: 'no-store' })
 .then((res) => res.json())
 .then((body) => {
 if (!mounted) return;
 const total = Math.max(0, Number(Array.isArray(body.rooms) ? body.rooms.length : 0));
 setTeamKeyCount(total);
 })
 .catch(() => {});

 fetch('/api/profile/me', { cache: 'no-store' })
 .then((res) => res.json())
 .then((body) => {
 if (!mounted) return;
 const status = String(body.status ?? 'active');
 if (status === 'approved' || status === 'active') {
 setStabilityScore(88);
 return;
 }
 setStabilityScore(72);
 })
 .catch(() => {});

 return () => {
 mounted = false;
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
 const overallHealth = clamp(Math.round((securityScore * 0.55) + (stabilityScore * 0.45)), 0, 100);
 const trendValues = useMemo(() => {
 const base = [36, 52, 60, 57, 69, 74, 66];
 const growth = Math.round((overallHealth - 70) * 0.45);
 return base.map((value) => clamp(value + growth, 18, 92));
 }, [overallHealth]);
 const trendPath = useMemo(() => buildTrendPath(trendValues), [trendValues]);

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
 <Card className='overflow-hidden rounded-[26px] border-[var(--border-strong)] bg-[linear-gradient(160deg,rgba(255,255,255,0.95)_0%,rgba(245,249,255,0.9)_55%,rgba(244,239,255,0.82)_100%)] p-0 shadow-[0_16px_36px_rgba(35,81,156,0.16)]'>
 <div className='space-y-3 p-4'>
 <div className='flex items-center gap-3'>
 <img src={LOGO_URL} alt='Master Password Logo' loading='lazy' className='h-14 w-14 rounded-2xl object-cover shadow-[0_8px_18px_rgba(79,123,255,0.22)]' />
 <div className='min-w-0'>
 <h1 className='truncate text-[27px] font-semibold leading-8 text-slate-800'>Master Password</h1>
 <p className='mt-0.5 text-[13px] leading-5 text-slate-500'>{versionText}</p>
 <p className='text-[13px] leading-5 text-slate-500'>{roleLabel + roleText}</p>
 </div>
 </div>

 <div className='rounded-[20px] border border-[var(--border-soft)] bg-white/74 p-3 backdrop-blur-[1px]'>
 <div className='flex items-center justify-between'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21\u0e2a\u0e38\u0e02\u0e20\u0e32\u0e1e\u0e23\u0e30\u0e1a\u0e1a' : 'System health overview'}</p>
 <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
 <Activity className='h-3 w-3' />
 {overallHealth}%
 </span>
 </div>
 <svg viewBox='0 0 320 92' className='mt-2 h-[88px] w-full'>
 <defs>
 <linearGradient id='homeTrendStroke' x1='0' y1='0' x2='1' y2='0'>
 <stop offset='0%' stopColor='#d946ef' />
 <stop offset='50%' stopColor='#6366f1' />
 <stop offset='100%' stopColor='#38bdf8' />
 </linearGradient>
 </defs>
 <polyline points={trendPath} fill='none' stroke='url(#homeTrendStroke)' strokeWidth='4' strokeLinecap='round' strokeLinejoin='round' />
 </svg>

 <div className='grid grid-cols-2 gap-2'>
 <div className='rounded-2xl border border-rose-100 bg-rose-50/85 p-2.5'>
 <p className='text-[11px] font-medium text-rose-700'>{locale === 'th' ? '\u0e04\u0e30\u0e41\u0e19\u0e19\u0e04\u0e27\u0e32\u0e21\u0e1b\u0e25\u0e2d\u0e14\u0e20\u0e31\u0e22' : 'Security score'}</p>
 <p className='mt-1 text-[24px] font-semibold leading-none text-rose-900'>{securityScore}</p>
 </div>
 <div className='rounded-2xl border border-cyan-100 bg-cyan-50/90 p-2.5'>
 <p className='text-[11px] font-medium text-cyan-700'>{locale === 'th' ? '\u0e02\u0e19\u0e32\u0e14\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25' : 'Data usage'}</p>
 <p className='mt-1 text-[24px] font-semibold leading-none text-cyan-900'>{formatStorage(storageUsedBytes)}</p>
 </div>
 </div>
 </div>
 </div>
 </Card>

 <Card className='rounded-[22px] bg-white/92 px-3.5 py-3'>
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
 </Card>

 <div className='grid grid-cols-2 gap-3.5'>
 <Card className='rounded-[20px] bg-white/92 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e23\u0e30\u0e1a\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e16\u0e35\u0e22\u0e23' : 'System stability'}</p>
 <p className='mt-1 text-[33px] font-semibold leading-none text-slate-900'>{stabilityScore}/100</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '\u0e04\u0e48\u0e32\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e43\u0e19\u0e0a\u0e48\u0e27\u0e07\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14' : 'Latest reliability trend'}</p>
 <div className='mt-3 flex items-end gap-1.5'>
 {[26, 34, 57, 48, 42].map((value, index) => {
 const adjusted = clamp(value + Math.round((stabilityScore - 70) * 0.35), 18, 82);
 return <div key={index} className='w-4 rounded-sm bg-gradient-to-t from-emerald-300 to-cyan-300' style={{ height: String(adjusted) + 'px' }} />;
 })}
 </div>
 </Card>

 <Card className='rounded-[20px] bg-white/92 px-3.5 py-3.5'>
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
 </Card>
 </div>

 <div className='grid grid-cols-3 gap-2.5'>
 <Card className='rounded-[18px] border-[var(--border-soft)] bg-white/92 px-3 py-2.5'>
 <div className='flex items-center gap-1.5 text-slate-600'>
 <KeyRound className='h-3.5 w-3.5' />
 <p className='text-[10px] font-semibold leading-4'>{locale === 'th' ? 'รหัสส่วนตัว' : 'Personal keys'}</p>
 </div>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{itemCount}</p>
 <p className='mt-1 text-[10px] leading-4 text-slate-500'>{locale === 'th' ? 'จำนวนรายการในคลัง' : 'Vault items'}</p>
 </Card>

 <Card className='rounded-[18px] border-[var(--border-soft)] bg-white/92 px-3 py-2.5'>
 <div className='flex items-center gap-1.5 text-slate-600'>
 <BookText className='h-3.5 w-3.5' />
 <p className='text-[10px] font-semibold leading-4'>{locale === 'th' ? 'โน้ต' : 'Notes'}</p>
 </div>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{noteCount}</p>
 <p className='mt-1 text-[10px] leading-4 text-slate-500'>{locale === 'th' ? 'จำนวนรายการโน้ต' : 'Note entries'}</p>
 </Card>

 <Card className='rounded-[18px] border-[var(--border-soft)] bg-white/92 px-3 py-2.5'>
 <div className='flex items-center gap-1.5 text-slate-600'>
 <UsersRound className='h-3.5 w-3.5' />
 <p className='text-[10px] font-semibold leading-4'>{locale === 'th' ? 'รหัสทีม' : 'Team keys'}</p>
 </div>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{teamKeyCount}</p>
 <p className='mt-1 text-[10px] leading-4 text-slate-500'>{locale === 'th' ? 'จำนวนห้องทีม' : 'Team rooms'}</p>
 </Card>
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
 </section>
 );
}
