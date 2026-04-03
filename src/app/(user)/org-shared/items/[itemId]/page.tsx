'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Eye, KeyRound, Link as LinkIcon, Type, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PinModal } from '@/components/vault/pin-modal';
import { useToast } from '@/components/ui/toast';
import type { PinAction } from '@/lib/pin';
import { useI18n } from '@/i18n/provider';

type TeamItemDetail = {
 id: string;
 roomId: string;
 title: string;
 username: string;
 url?: string | null;
 secretMasked: string;
};

type PendingAction = {
 action: PinAction;
 label: string;
 mode: 'view_secret' | 'copy_secret';
};

export default function TeamItemDetailPage() {
 const params = useParams<{ itemId: string }>();
 const router = useRouter();
 const { showToast } = useToast();
 const { locale } = useI18n();

 const itemId = useMemo(() => {
 if (Array.isArray(params.itemId)) return decodeURIComponent(params.itemId[0] ?? '');
 return decodeURIComponent(params.itemId ?? '');
 }, [params.itemId]);

 const [item, setItem] = useState<TeamItemDetail | null>(null);
 const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
 const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

 const loadItem = useCallback(async () => {
 if (!itemId) return;
 const res = await fetch('/api/team-room-items/' + encodeURIComponent(itemId), { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as TeamItemDetail & { error?: string };
 if (!res.ok) {
 showToast(body.error ?? 'Failed to load item', 'error');
 router.push('/org-shared');
 return;
 }
 setItem(body);
 }, [itemId, router, showToast]);

 useEffect(() => {
 void loadItem();
 }, [loadItem]);

 async function copyText(value: string, okText: string) {
 try {
 await navigator.clipboard.writeText(value);
 showToast(okText, 'success');
 } catch {
 showToast(locale === 'th' ? 'คัดลอกไม่สำเร็จ' : 'Copy failed', 'error');
 }
 }

 async function runSecure(actionData: PendingAction, assertionToken: string) {
 const res = await fetch('/api/team-room-items/' + encodeURIComponent(itemId) + '/secret?action=' + actionData.action, {
 headers: { 'x-pin-assertion': assertionToken },
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string; secret?: string };
 if (!res.ok || body.secret == null) {
 showToast(body.error ?? 'Action failed', 'error');
 return;
 }

 if (actionData.mode === 'copy_secret') {
 await copyText(String(body.secret), locale === 'th' ? 'คัดลอกรหัสผ่านแล้ว' : 'Password copied');
 return;
 }

 setRevealedSecret(String(body.secret));
 }

 return (
 <section className='space-y-4 pb-20'>
 <button type='button' className='inline-flex items-center gap-1 text-sm text-blue-700' onClick={() => router.push(item?.roomId ? '/org-shared/' + encodeURIComponent(item.roomId) : '/org-shared')}>
 <ArrowLeft className='h-4 w-4' /> {locale === 'th' ? 'กลับห้องทีม' : 'Back to room'}
 </button>

 <Card className='space-y-4'>
 <h1 className='text-lg font-semibold'>{item?.title ?? (locale === 'th' ? 'รายละเอียดรายการ' : 'Item detail')}</h1>

 <div className='space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3'>
 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
 <Type className='h-4 w-4 text-slate-500' />
 {locale === 'th' ? 'ชื่อรายการ' : 'Title'}: {item?.title ?? '-'}
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => void copyText(String(item?.title ?? ''), locale === 'th' ? 'คัดลอกชื่อแล้ว' : 'Title copied')}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>

 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
 <UserRound className='h-4 w-4 text-slate-500' />
 {locale === 'th' ? 'ชื่อผู้ใช้' : 'Username'}: {item?.username ?? '-'}
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => void copyText(String(item?.username ?? ''), locale === 'th' ? 'คัดลอกชื่อผู้ใช้แล้ว' : 'Username copied')}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>

 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
 <KeyRound className='h-4 w-4 text-slate-500' />
 {locale === 'th' ? 'รหัสผ่าน' : 'Password'}: <span className='font-semibold'>{revealedSecret ?? item?.secretMasked ?? '**********'}</span>
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => setPendingAction({ action: 'copy_secret', label: locale === 'th' ? 'คัดลอกรหัสผ่าน' : 'Copy password', mode: 'copy_secret' })}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>

 {item?.url ? (
 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
 <LinkIcon className='h-4 w-4 text-slate-500' />
 URL: {item.url}
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => void copyText(String(item.url ?? ''), locale === 'th' ? 'คัดลอกลิงก์แล้ว' : 'Link copied')}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>
 ) : null}
 </div>

 <Button variant='secondary' className='h-11 rounded-xl' onClick={() => setPendingAction({ action: 'view_secret', label: locale === 'th' ? 'แสดงรหัสผ่าน' : 'Reveal password', mode: 'view_secret' })}>
 <span className='inline-flex items-center gap-2'>
 <Eye className='h-4 w-4' />
 {locale === 'th' ? 'แสดงรหัส' : 'Reveal'}
 </span>
 </Button>
 </Card>

 {pendingAction ? (
 <PinModal
 action={pendingAction.action}
 actionLabel={pendingAction.label}
 targetItemId={itemId}
 onVerified={(assertionToken) => void runSecure(pendingAction, assertionToken)}
 onClose={() => setPendingAction(null)}
 />
 ) : null}
 </section>
 );
}

