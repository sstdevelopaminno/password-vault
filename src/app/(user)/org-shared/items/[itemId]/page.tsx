'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRightLeft, Copy, Eye, KeyRound, Link as LinkIcon, Type, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PinModal } from '@/components/vault/pin-modal';
import { useToast } from '@/components/ui/toast';
import type { PinAction } from '@/lib/pin';
import { fetchWithSessionRetry } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';

type TeamItemDetail = {
 id: string;
 roomId: string;
 title: string;
 username: string;
 url?: string | null;
 secretMasked: string;
};

type TeamRoomOption = {
 id: string;
 name: string;
 memberRole: 'owner' | 'member';
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

 const [moveOpen, setMoveOpen] = useState(false);
 const [moveLoading, setMoveLoading] = useState(false);
 const [moving, setMoving] = useState(false);
 const [moveRooms, setMoveRooms] = useState<TeamRoomOption[]>([]);
 const [targetRoomId, setTargetRoomId] = useState('');

 const loadItem = useCallback(async () => {
 if (!itemId) return;
 const res = await fetchWithSessionRetry('/api/team-room-items/' + encodeURIComponent(itemId), { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as TeamItemDetail & { error?: string };
 if (!res.ok) {
 showToast(body.error ?? 'Failed to load item', 'error');
 router.push('/org-shared');
 return;
 }
 setItem(body);
 }, [itemId, router, showToast]);

 useEffect(() => {
 const timer = window.setTimeout(() => {
 void loadItem();
 }, 0);
 return () => window.clearTimeout(timer);
 }, [loadItem]);

 async function copyText(value: string, okText: string) {
 try {
 await navigator.clipboard.writeText(value);
 showToast(okText, 'success');
 } catch {
 showToast(locale === 'th' ? 'เธเธฑเธ”เธฅเธญเธเนเธกเนเธชเธณเน€เธฃเนเธ' : 'Copy failed', 'error');
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
 await copyText(String(body.secret), locale === 'th' ? 'เธเธฑเธ”เธฅเธญเธเธฃเธซเธฑเธชเธเนเธฒเธเนเธฅเนเธง' : 'Password copied');
 return;
 }

 setRevealedSecret(String(body.secret));
 }

 async function openMoveModal() {
 if (!item?.roomId || moveLoading) return;
 setMoveLoading(true);
 const res = await fetchWithSessionRetry('/api/team-rooms', { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as {
 error?: string;
 rooms?: Array<{ id: string; name?: string; memberRole?: 'owner' | 'member' }>;
 };
 setMoveLoading(false);

 if (!res.ok) {
 showToast(body.error ?? 'Failed to load rooms', 'error');
 return;
 }

 const options = (body.rooms ?? [])
 .map((room) => ({
 id: room.id,
 name: room.name ?? '',
 memberRole: room.memberRole ?? 'member',
 }))
 .filter((room) => room.id !== item.roomId);

 setMoveRooms(options);
 setTargetRoomId(options[0]?.id ?? '');
 setMoveOpen(true);
 }

 async function moveItemToRoom() {
 if (!item || !targetRoomId || moving) return;
 setMoving(true);
 const res = await fetch('/api/team-room-items/' + encodeURIComponent(item.id) + '/move', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ targetRoomId }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setMoving(false);

 if (!res.ok) {
 showToast(body.error ?? 'Move failed', 'error');
 return;
 }

 showToast(locale === 'th' ? 'เธขเนเธฒเธขเธฃเธซเธฑเธชเนเธเธซเนเธญเธเนเธซเธกเนเนเธฅเนเธง' : 'Item moved successfully', 'success');
 setMoveOpen(false);
 router.push('/org-shared/' + encodeURIComponent(targetRoomId));
 }

 return (
 <section className='space-y-4 pb-20'>
 <button type='button' className='inline-flex items-center gap-1 text-app-body text-blue-700' onClick={() => router.push(item?.roomId ? '/org-shared/' + encodeURIComponent(item.roomId) : '/org-shared')}>
 <ArrowLeft className='h-4 w-4' /> {locale === 'th' ? 'เธเธฅเธฑเธเธซเนเธญเธเธ—เธตเธก' : 'Back to room'}
 </button>

 <Card className='space-y-4'>
 <h1 className='text-app-h3 font-semibold'>{item?.title ?? (locale === 'th' ? 'เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธฃเธฒเธขเธเธฒเธฃ' : 'Item detail')}</h1>

 <div className='space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3'>
 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-app-body text-slate-700'>
 <Type className='h-4 w-4 text-slate-500' />
 {locale === 'th' ? 'เธเธทเนเธญเธฃเธฒเธขเธเธฒเธฃ' : 'Title'}: {item?.title ?? '-'}
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => void copyText(String(item?.title ?? ''), locale === 'th' ? 'เธเธฑเธ”เธฅเธญเธเธเธทเนเธญเนเธฅเนเธง' : 'Title copied')}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>

 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-app-body text-slate-700'>
 <UserRound className='h-4 w-4 text-slate-500' />
 {locale === 'th' ? 'เธเธทเนเธญเธเธนเนเนเธเน' : 'Username'}: {item?.username ?? '-'}
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => void copyText(String(item?.username ?? ''), locale === 'th' ? 'เธเธฑเธ”เธฅเธญเธเธเธทเนเธญเธเธนเนเนเธเนเนเธฅเนเธง' : 'Username copied')}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>

 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-app-body text-slate-700'>
 <KeyRound className='h-4 w-4 text-slate-500' />
 {locale === 'th' ? 'เธฃเธซเธฑเธชเธเนเธฒเธ' : 'Password'}: <span className='font-semibold'>{revealedSecret ?? item?.secretMasked ?? '**********'}</span>
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => setPendingAction({ action: 'copy_secret', label: locale === 'th' ? 'เธเธฑเธ”เธฅเธญเธเธฃเธซเธฑเธชเธเนเธฒเธ' : 'Copy password', mode: 'copy_secret' })}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>

 {item?.url ? (
 <div className='flex items-center justify-between gap-2'>
 <p className='inline-flex items-center gap-2 text-app-body text-slate-700'>
 <LinkIcon className='h-4 w-4 text-slate-500' />
 URL: {item.url}
 </p>
 <Button size='sm' variant='secondary' className='h-8 rounded-lg px-2.5' onClick={() => void copyText(String(item.url ?? ''), locale === 'th' ? 'เธเธฑเธ”เธฅเธญเธเธฅเธดเธเธเนเนเธฅเนเธง' : 'Link copied')}>
 <Copy className='h-3.5 w-3.5' />
 </Button>
 </div>
 ) : null}
 </div>

 <div className='grid grid-cols-2 gap-2'>
 <Button variant='secondary' className='h-11 rounded-xl' onClick={() => setPendingAction({ action: 'view_secret', label: locale === 'th' ? 'เนเธชเธ”เธเธฃเธซเธฑเธชเธเนเธฒเธ' : 'Reveal password', mode: 'view_secret' })}>
 <span className='inline-flex items-center gap-2'>
 <Eye className='h-4 w-4' />
 {locale === 'th' ? 'เนเธชเธ”เธเธฃเธซเธฑเธช' : 'Reveal'}
 </span>
 </Button>

 <Button variant='secondary' className='h-11 rounded-xl' onClick={() => void openMoveModal()} disabled={moveLoading}>
 <span className='inline-flex items-center gap-2'>
 <ArrowRightLeft className='h-4 w-4' />
 {moveLoading ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธซเนเธญเธ...' : 'Loading rooms...') : locale === 'th' ? 'เธขเนเธฒเธขเนเธเธซเนเธญเธเธญเธทเนเธ' : 'Move to another room'}
 </span>
 </Button>
 </div>
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

 {moveOpen ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='mx-auto mt-12 w-full max-w-[420px] animate-slide-up rounded-[24px] bg-white p-4 shadow-2xl'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-app-body font-semibold'>{locale === 'th' ? 'เธขเนเธฒเธขเธฃเธซเธฑเธชเนเธเธซเนเธญเธเธญเธทเนเธ' : 'Move item to another room'}</h2>
 <button type='button' onClick={() => setMoveOpen(false)} className='rounded-full p-1 text-slate-500 hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>

 {moveRooms.length === 0 ? (
 <p className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-app-body text-slate-600'>
 {locale === 'th' ? 'เนเธกเนเธเธเธซเนเธญเธเธเธฅเธฒเธขเธ—เธฒเธเธ—เธตเนเธชเธฒเธกเธฒเธฃเธ–เธขเนเธฒเธขเนเธ”เน' : 'No eligible target room found.'}
 </p>
 ) : (
 <div className='space-y-3'>
 <select value={targetRoomId} onChange={(e) => setTargetRoomId(e.target.value)} className='h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-app-body text-slate-800 outline-none focus:border-blue-300'>
 {moveRooms.map((room) => (
 <option key={room.id} value={room.id}>{room.name}</option>
 ))}
 </select>
 <Button type='button' className='w-full' onClick={() => void moveItemToRoom()} disabled={!targetRoomId || moving}>
 {moving ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธขเนเธฒเธข...' : 'Moving...') : locale === 'th' ? 'เธขเนเธฒเธขเธ—เธฑเธเธ—เธต' : 'Move now'}
 </Button>
 </div>
 )}
 </div>
 </div>
 ) : null}
 </section>
 );
}

