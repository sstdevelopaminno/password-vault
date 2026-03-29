'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type AddVaultItemSheetProps = {
 onCreated: (item: { id: string; title: string; username: string; updatedAt: string; category: string }) => void;
};

export function AddVaultItemSheet({ onCreated }: AddVaultItemSheetProps) {
 const { showToast } = useToast();
 const { t, locale } = useI18n();
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [form, setForm] = useState({ title: '', username: '', secret: '', category: t('vault.categoryGeneral'), url: '', notes: '' });

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);

 try {
 const res = await fetch('/api/vault', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(form),
 });

 const body = (await res.json().catch(() => ({}))) as {
 error?: string;
 item?: { id: string; title: string; username: string; category?: string | null; updatedAt?: string };
 };

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
 } catch {
 setLoading(false);
 showToast(t('addItem.saveFailed'), 'error');
 }
 }

 return (
 <>
 <button
 type='button'
 aria-label={t('vault.addItemAria')}
 onClick={() => { if (!open) setOpen(true); }}
 className='fixed bottom-24 right-5 z-30 inline-flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-[0_10px_24px_rgba(37,99,235,0.45)] transition active:scale-[0.98] hover:brightness-110'
 >
 <Plus className='h-6 w-6' />
 </button>

 {open ? (
 <div className='fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px]'>
 <div className='absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] animate-slide-up rounded-t-[28px] bg-white p-4 shadow-2xl'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-base font-semibold'>{t('addItem.title')}</h2>
 <button onClick={() => setOpen(false)} className='rounded-full p-1 text-slate-500 hover:bg-slate-100' aria-label={t('addItem.closeAria')}>
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


