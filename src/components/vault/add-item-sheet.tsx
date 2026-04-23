'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
 url: '',
 notes: '',
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
 setForm({ title: '', username: '', secret: '', category: t('vault.categoryGeneral'), url: '', notes: '' });
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
 setForm({ title: '', username: '', secret: '', category: t('vault.categoryGeneral'), url: '', notes: '' });
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
 className='absolute inset-x-0 mx-auto w-[calc(100%-12px)] max-h-[calc(100dvh-120px)] max-w-[480px] overflow-y-auto animate-slide-up rounded-[30px] border border-[var(--border-soft)] bg-[var(--card)] p-4 shadow-[var(--glow-soft)]'
 style={{ bottom: sheetBottom }}
 >
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-app-body font-semibold text-slate-900'>{t('addItem.title')}</h2>
 <button
 onClick={() => setOpen(false)}
 className='rounded-full p-1 text-slate-500 hover:bg-white/20'
 aria-label={t('addItem.closeAria')}
 >
 <X className='h-5 w-5' />
 </button>
 </div>

 <Card>
 <form className='space-y-3' onSubmit={submit}>
 <Input placeholder={t('addItem.fieldTitle')} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} required />
 <Input placeholder={t('addItem.fieldUsername')} value={form.username} onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))} required />
 <Input type='password' placeholder={t('addItem.fieldSecret')} value={form.secret} onChange={(e) => setForm((v) => ({ ...v, secret: e.target.value }))} required />
 <Input placeholder={t('addItem.fieldCategory')} value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))} />
 <Input placeholder={t('addItem.fieldUrl')} value={form.url} onChange={(e) => setForm((v) => ({ ...v, url: e.target.value }))} />
 <Input placeholder={t('addItem.fieldNotes')} value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />

 <Button className='w-full' disabled={loading}>
 {loading ? (
 <span className='inline-flex items-center gap-2'>
 <Spinner /> {t('addItem.saving')}
 </span>
 ) : (
 t('addItem.save')
 )}
 </Button>
 </form>
 </Card>
 </div>
 </div>
 ) : null}
 </>
 );
}


