'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Plus, ShieldCheck, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';
import { queueOfflineRequest } from '@/lib/offline-sync';
import { useOutageState } from '@/lib/outage-detector';

type CreatedItem = {
 id: string;
 title: string;
 username: string;
 updatedAt: string;
 category: string;
};

type AddVaultItemSheetProps = {
 onCreated: (item: CreatedItem) => void;
 endpoint?: string;
 fabOffsetPx?: number;
 sheetOffsetPx?: number;
};

const SAVE_TIMEOUT_MS = 12000;

export function AddVaultItemSheet({
 onCreated,
 endpoint = '/api/vault',
 fabOffsetPx = 96,
 sheetOffsetPx = 78,
}: AddVaultItemSheetProps) {
 const router = useRouter();
 const { showToast } = useToast();
 const { t, locale } = useI18n();
 const { isOfflineMode } = useOutageState();

 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [form, setForm] = useState({
 title: '',
 username: '',
 secret: '',
 category: t('vault.categoryGeneral'),
 });

 const fabBottom = useMemo(() => 'calc(env(safe-area-inset-bottom) + ' + String(fabOffsetPx) + 'px)', [fabOffsetPx]);
 const fabRight = useMemo(() => 'max(14px, calc((100vw - min(100vw, 460px)) / 2 + 14px))', []);
 const sheetBottom = useMemo(() => 'calc(env(safe-area-inset-bottom) + ' + String(sheetOffsetPx) + 'px)', [sheetOffsetPx]);

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 if (loading) return;
 setLoading(true);

 const controller = new AbortController();
 const timer = window.setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);

 try {
 if (isOfflineMode) {
 const createdAt = new Date().toISOString();
 await queueOfflineRequest(
 endpoint,
 'POST',
 form,
 { 'Content-Type': 'application/json' },
 { feature: 'vault', label: 'Create vault item' },
 );
 onCreated({
 id: 'offline-' + Date.now(),
 title: form.title,
 username: form.username,
 updatedAt: new Date(createdAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US'),
 category: form.category,
 });
 setLoading(false);
 setOpen(false);
 setForm({ title: '', username: '', secret: '', category: t('vault.categoryGeneral') });
 showToast(locale === 'th' ? 'บันทึกแบบออฟไลน์แล้ว ระบบจะซิงก์อัตโนมัติเมื่อออนไลน์' : 'Saved offline. It will sync automatically when online.', 'success');
 return;
 }

 const res = await fetch(endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 signal: controller.signal,
 body: JSON.stringify(form),
 });

 const body = (await res.json().catch(() => ({}))) as {
 error?: string;
 item?: { id: string; title: string; username: string; category?: string | null; updatedAt?: string };
 };

 if (res.status === 401) {
 setLoading(false);
 showToast(locale === 'th' ? 'Session expired. Please sign in again.' : 'Session expired. Please sign in again.', 'error');
 router.replace('/login');
 return;
 }

 if (!res.ok || !body.item) {
 setLoading(false);
 showToast(body.error ?? t('addItem.saveFailed'), 'error');
 return;
 }

 const updatedAtText = body.item.updatedAt
 ? new Date(body.item.updatedAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US')
 : t('vault.justNow');

 onCreated({
 id: body.item.id,
 title: body.item.title,
 username: body.item.username,
 updatedAt: updatedAtText,
 category: body.item.category ?? form.category,
 });

 setLoading(false);
 setOpen(false);
 setForm({ title: '', username: '', secret: '', category: t('vault.categoryGeneral') });
 showToast(t('addItem.saveSuccess'), 'success');
 } catch (error) {
 setLoading(false);
 if ((error as Error).name === 'AbortError') {
 showToast(locale === 'th' ? 'Save is taking too long. Please retry.' : 'Save is taking too long. Please retry.', 'error');
 return;
 }
 showToast(t('addItem.saveFailed'), 'error');
 } finally {
 window.clearTimeout(timer);
 }
 }

 return (
 <>
 <button
 type='button'
 aria-label={t('vault.addItemAria')}
 onClick={() => {
 if (!open) setOpen(true);
 }}
 style={{ bottom: fabBottom, right: fabRight }}
 className='fixed z-30 inline-flex h-[60px] w-[60px] touch-manipulation items-center justify-center rounded-full border border-[rgba(159,177,255,0.4)] bg-[var(--grad-main)] text-white shadow-[0_12px_30px_rgba(47,123,255,0.38),0_0_26px_rgba(255,62,209,0.34)] transition active:scale-[0.98] hover:brightness-110'
 >
 <Plus className='h-6 w-6' />
 </button>

 {open ? (
 <div className='fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-[2px]'>
 <div
 className='absolute inset-x-0 mx-auto w-[calc(100%-12px)] max-h-[calc(100dvh-120px)] max-w-[480px] overflow-y-auto animate-slide-up rounded-[30px] border border-[var(--border-strong)] bg-[linear-gradient(180deg,rgba(11,23,58,0.98),rgba(8,18,50,0.99))] p-4 shadow-[0_24px_56px_rgba(3,9,27,0.65)]'
 style={{ bottom: sheetBottom }}
 >
 <div className='mb-4 flex items-start justify-between gap-3'>
 <div className='space-y-1'>
 <h2 className='text-app-h2 font-semibold text-slate-100'>{t('addItem.title')}</h2>
 <p className='text-app-caption text-slate-300'>
 {locale === 'th' ? 'กรอกข้อมูลที่จำเป็นเพื่อบันทึกเข้าคลังรหัสอย่างปลอดภัย' : 'Fill in required fields to save this secret securely.'}
 </p>
 </div>
 <button
 onClick={() => setOpen(false)}
 className='rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] p-1.5 text-slate-300 transition hover:text-white'
 aria-label={t('addItem.closeAria')}
 >
 <X className='h-5 w-5' />
 </button>
 </div>

 <form className='space-y-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3.5' onSubmit={submit}>
 <label className='block space-y-1.5'>
 <span className='inline-flex items-center gap-1.5 text-app-micro font-semibold text-slate-300'>
 <ShieldCheck className='h-3.5 w-3.5 text-cyan-300' />
 {t('addItem.fieldTitle')}
 </span>
 <Input
 placeholder={t('addItem.fieldTitle')}
 value={form.title}
 onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
 required
 />
 </label>
 <label className='block space-y-1.5'>
 <span className='inline-flex items-center gap-1.5 text-app-micro font-semibold text-slate-300'>
 <UserRound className='h-3.5 w-3.5 text-cyan-300' />
 {t('addItem.fieldUsername')}
 </span>
 <Input
 placeholder={t('addItem.fieldUsername')}
 value={form.username}
 onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
 required
 />
 </label>
 <label className='block space-y-1.5'>
 <span className='inline-flex items-center gap-1.5 text-app-micro font-semibold text-slate-300'>
 <KeyRound className='h-3.5 w-3.5 text-cyan-300' />
 {t('addItem.fieldSecret')}
 </span>
 <Input
 type='password'
 placeholder={t('addItem.fieldSecret')}
 value={form.secret}
 onChange={(e) => setForm((v) => ({ ...v, secret: e.target.value }))}
 required
 />
 </label>
 <label className='block space-y-1.5'>
 <span className='text-app-micro font-semibold text-slate-300'>{t('addItem.fieldCategory')}</span>
 <Input
 placeholder={t('addItem.fieldCategory')}
 value={form.category}
 onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}
 />
 </label>

 <div className='grid grid-cols-2 gap-2 pt-1'>
 <Button type='button' variant='secondary' className='h-11' onClick={() => setOpen(false)} disabled={loading}>
 {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
 </Button>
 <Button className='h-11 w-full' disabled={loading}>
 {loading ? (
 <span className='inline-flex items-center gap-2'>
 <Spinner /> {t('addItem.saving')}
 </span>
 ) : (
 t('addItem.save')
 )}
 </Button>
 </div>
 </form>
 </div>
 </div>
 ) : null}
 </>
 );
}

