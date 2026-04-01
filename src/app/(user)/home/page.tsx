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
 if (locale === 'th') return securityScore > 79 ? '��' : '�ҹ��ҧ';
 return securityScore > 79 ? 'Good' : 'Moderate';
 }, [locale, securityScore]);

 const roleText = locale === 'th' ? '�����ҹ�����' : 'General User';
 const roleLabel = locale === 'th' ? '�Է���: ' : 'Role: ';
 const versionText = versionLabel(locale);
 const healthScore = Math.round(clamp(securityScore * 0.58 + stabilityScore * 0.42, 0, 99));

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

 <Card className='overflow-hidden rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/65 to-cyan-50/65 px-4 py-4 shadow-[0_20px_36px_rgba(16,139,128,0.18)]'>
 <p className='text-sm font-medium text-emerald-900/80'>{locale === 'th' ? '��ṹ�آ�Ҿ�к�' : 'System health score'}</p>
 <p className='mt-1 text-[82px] font-semibold leading-[0.9] tracking-[-0.03em] text-slate-900'>{healthScore}</p>
 <div className='mt-4 grid grid-cols-3 gap-2'>
 {[4, -2, -6].map((offset, index) => {
 const segment = clamp(healthScore + offset, 20, 100);
 return (
 <div key={index} className='h-2.5 overflow-hidden rounded-full bg-emerald-100/80'>
 <div className='h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-300 transition-all duration-500' style={{ width: String(segment) + '%' }} />
 </div>
 );
 })}
 </div>
 </Card>

 <div className='grid grid-cols-2 gap-3.5'>
 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '��¡��㹤�ѧ' : 'Vault items'}</p>
 <p className='mt-1 text-[39px] font-semibold leading-[1.03] text-slate-900'>{itemCount}</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '���������' : 'All categories'}</p>
 </Card>

 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '�дѺ������ʹ����к�' : 'System security'}</p>
 <p className='mt-1 text-[39px] font-semibold leading-[1.03] text-slate-900'>{securityScore}</p>
 <p className='mt-2 text-xs text-slate-500'>{securityLabel}</p>
 </Card>

 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '�����ʶ����к�' : 'System stability'}</p>
 <p className='mt-1 text-[32px] font-semibold leading-none text-slate-900'>{stabilityScore}/100</p>
 <div className='mt-3 flex items-end gap-1.5'>
 {[24, 37, 58, 42, 31].map((value, index) => {
 const adjusted = clamp(value + Math.round((stabilityScore - 70) * 0.4), 16, 82);
 return <div key={index} className='w-4 rounded-sm bg-gradient-to-t from-emerald-300 to-cyan-300' style={{ height: String(adjusted) + 'px' }} />;
 })}
 </div>
 </Card>

 <Card className='min-h-[150px] rounded-[20px] bg-white/90 px-3.5 py-3.5'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? '��鹷����ҹ��ԧ�ͧ�س' : 'Your actual data usage'}</p>
 <p className='mt-1 text-[30px] font-semibold leading-none text-slate-900'>{formatStorage(storageUsedBytes)}</p>
 <p className='mt-2 text-xs text-slate-500'>{locale === 'th' ? '�ӹǳ�ҡ�����ŷ��ѹ�֡��ԧ' : 'Calculated from your saved items'}</p>
 </Card>
 </div>
 </section>
 );
}
