'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function HomePage() {
 const { locale } = useI18n();
 const [itemCount, setItemCount] = useState(0);
 const [storageUsedBytes, setStorageUsedBytes] = useState(0);
 const [securityScore, setSecurityScore] = useState(66);
 const [stabilityScore, setStabilityScore] = useState(84);

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

 return (
 <section className='space-y-4 pb-24 pt-2'>
 <Card className='rounded-[24px] border-[var(--border-strong)] bg-white/92 px-4 py-4 shadow-[0_14px_34px_rgba(35,81,156,0.14)] backdrop-blur'>
 <div className='flex items-center gap-3'>
 <img src={LOGO_URL} alt='Master Password Logo' loading='lazy' className='h-14 w-14 rounded-2xl object-cover shadow-[0_8px_18px_rgba(79,123,255,0.22)]' />
 <div className='min-w-0'>
 <h1 className='truncate text-[28px] font-semibold leading-8 text-slate-800'>Master Password</h1>
 <p className='mt-0.5 text-[14px] leading-5 text-slate-500'>{versionText}</p>
 <p className='text-[14px] leading-5 text-slate-500'>{roleLabel + roleText}</p>
 </div>
 </div>
 </Card>

 <div className='grid grid-cols-2 gap-3.5'>
 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e43\u0e19\u0e04\u0e25\u0e31\u0e07' : 'Vault items'}</p>
 <p className='mt-1 text-[39px] font-semibold leading-[1.03] text-slate-900'>{itemCount}</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '\u0e23\u0e27\u0e21\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14' : 'All categories'}</p>
 </Card>

 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e1b\u0e25\u0e2d\u0e14\u0e20\u0e31\u0e22\u0e23\u0e30\u0e1a\u0e1a' : 'System security'}</p>
 <p className='mt-1 text-[39px] font-semibold leading-[1.03] text-slate-900'>{securityScore}</p>
 <p className='mt-2 text-xs text-slate-500'>{securityLabel}</p>
 </Card>

 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e16\u0e35\u0e22\u0e23\u0e23\u0e30\u0e1a\u0e1a' : 'System stability'}</p>
 <p className='mt-1 text-[32px] font-semibold leading-none text-slate-900'>{stabilityScore}/100</p>
 <div className='mt-3 flex items-end gap-1.5'>
 {[24, 37, 58, 42, 31].map((value, index) => {
 const adjusted = clamp(value + Math.round((stabilityScore - 70) * 0.4), 16, 82);
 return <div key={index} className='w-4 rounded-sm bg-gradient-to-t from-emerald-300 to-cyan-300' style={{ height: String(adjusted) + 'px' }} />;
 })}
 </div>
 </Card>

 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e08\u0e23\u0e34\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13' : 'Your actual data usage'}</p>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{formatStorage(storageUsedBytes)}</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '\u0e04\u0e33\u0e19\u0e27\u0e13\u0e08\u0e32\u0e01\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e35\u0e48\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e08\u0e23\u0e34\u0e07' : 'Calculated from your saved items'}</p>
 </Card>
 </div>
 </section>
 );
}
