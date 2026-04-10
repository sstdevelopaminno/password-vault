'use client';

import { useMemo, useRef, useState } from 'react';
import { Globe, KeyRound, Link2Off, MessageCirclePlus, Pencil, Trash2, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/provider';

type VaultCardProps = {
 id: string;
 title: string;
 username: string;
 updatedAt: string;
 category?: string;
 sharedToTeamCount?: number;
 pending?: boolean;
 onOpen: (id: string) => void;
 onEdit: (id: string) => void;
 onDelete: (id: string) => void;
 onShare?: (id: string) => void;
 onUnshare?: (id: string) => void;
};

const ACTION_WIDTH = 124;

function clamp(value: number, min: number, max: number) {
 return Math.min(max, Math.max(min, value));
}

export function VaultCard({
 id,
 title,
 username,
 updatedAt,
 category = 'General',
 sharedToTeamCount = 0,
 pending = false,
 onOpen,
 onEdit,
 onDelete,
 onShare,
 onUnshare,
}: VaultCardProps) {
 const { t, locale } = useI18n();

 const [offsetX, setOffsetX] = useState(0);
 const [dragging, setDragging] = useState(false);

 const pointerIdRef = useRef<number | null>(null);
 const dragStartXRef = useRef(0);
 const dragStartOffsetRef = useRef(0);
 const movedRef = useRef(false);

 const opened = useMemo(() => offsetX <= -ACTION_WIDTH + 2, [offsetX]);
 const sharedCount = Math.max(0, sharedToTeamCount);
 const isSharedToTeam = sharedCount > 0;

 function closeSwipe() {
 setOffsetX(0);
}

 function openSwipe() {
 setOffsetX(-ACTION_WIDTH);
}

 function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
 if (event.button !== 0) return;
 pointerIdRef.current = event.pointerId;
 dragStartXRef.current = event.clientX;
 dragStartOffsetRef.current = offsetX;
 movedRef.current = false;
 setDragging(true);
 event.currentTarget.setPointerCapture(event.pointerId);
}

 function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
 if (!dragging || pointerIdRef.current !== event.pointerId) return;
 const delta = event.clientX - dragStartXRef.current;
 const next = clamp(dragStartOffsetRef.current + delta, -ACTION_WIDTH, 0);
 if (Math.abs(delta) > 4) movedRef.current = true;
 setOffsetX(next);
}

 function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
 if (pointerIdRef.current !== event.pointerId) return;
 event.currentTarget.releasePointerCapture(event.pointerId);
 pointerIdRef.current = null;
 setDragging(false);
 if (offsetX < -ACTION_WIDTH / 2) {
 openSwipe();
 } else {
 closeSwipe();
 }
}

 function onCardClick() {
 if (movedRef.current) return;
 if (opened) {
 closeSwipe();
 return;
 }
 onOpen(id);
}

 return (
 <div className='relative overflow-hidden rounded-[20px]'>
 <div className='absolute inset-y-0 right-0 flex w-[124px] items-center justify-end gap-1.5 rounded-[20px] bg-slate-100 p-1.5'>
 <button
 type='button'
 onClick={() => {
 closeSwipe();
 onEdit(id);
 }}
 className='inline-flex h-full w-[54px] flex-col items-center justify-center rounded-[14px] bg-gradient-to-b from-indigo-500 to-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.26)] transition hover:brightness-110'
 >
 <Pencil className='h-4 w-4' />
 <span className='mt-1 text-[10px] font-semibold'>{t('vaultDetail.edit')}</span>
 </button>

 <button
 type='button'
 onClick={() => {
 closeSwipe();
 onDelete(id);
 }}
 className='inline-flex h-full w-[54px] flex-col items-center justify-center rounded-[14px] bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-[0_8px_16px_rgba(225,29,72,0.26)] transition hover:brightness-110'
 >
 <Trash2 className='h-4 w-4' />
 <span className='mt-1 text-[10px] font-semibold'>{t('vaultDetail.delete')}</span>
 </button>
 </div>

 <div
 className='touch-pan-y transition-transform duration-200 ease-out will-change-transform'
 style={{ transform: 'translate3d(' + String(offsetX) + 'px, 0, 0)' }}
 onPointerDown={onPointerDown}
 onPointerMove={onPointerMove}
 onPointerUp={onPointerUp}
 onPointerCancel={onPointerUp}
 >
 <Card className='space-y-2.5 rounded-[20px] p-3.5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(37,99,235,0.12)]' onClick={onCardClick}>
 <div className='flex items-start justify-between gap-3'>
 <div className='min-w-0'>
 <h3 className='truncate text-[22px] font-semibold leading-tight text-slate-900'>{title}</h3>
 <p className='mt-1.5 inline-flex w-full items-center gap-1.5 text-[16px] leading-5 text-slate-500'>
 <UserRound className='h-3.5 w-3.5 shrink-0' />
 <span className='truncate'>{username}</span>
 </p>
 </div>
 <div className='shrink-0 flex items-center gap-1.5'>
	 {isSharedToTeam ? (
 <span
 className='inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'
 title={locale === 'th' ? 'แชร์ไปทีมแล้ว' : 'Shared to team'}
 >
 <span className='h-2 w-2 rounded-full bg-emerald-500' />
 {sharedCount}
 </span>
	 ) : null}
 {pending ? (
 <span
 className='inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700'
 title={locale === 'th' ? 'รอซิงก์' : 'Pending sync'}
 >
 <span className='h-2 w-2 rounded-full bg-amber-500' />
 {locale === 'th' ? 'รอซิงก์' : 'Pending'}
 </span>
 ) : null}
 {onShare ? (
 <button
 type='button'
 onClick={(event) => {
 event.stopPropagation();
 closeSwipe();
 onShare(id);
 }}
 className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100'
 title={locale === 'th' ? 'แชร์ไปทีม' : 'Share to team'}
 aria-label={locale === 'th' ? 'แชร์ไปทีม' : 'Share to team'}
 >
 <MessageCirclePlus className='h-4 w-4' />
 </button>
 ) : null}
 {isSharedToTeam && onUnshare ? (
 <button
 type='button'
 onClick={(event) => {
 event.stopPropagation();
 closeSwipe();
 onUnshare(id);
 }}
 className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-700 transition hover:bg-rose-100'
 title={locale === 'th' ? 'ยกเลิกแชร์ไปทีม' : 'Cancel team share'}
 aria-label={locale === 'th' ? 'ยกเลิกแชร์ไปทีม' : 'Cancel team share'}
 >
 <Link2Off className='h-4 w-4' />
 </button>
 ) : null}
 <span className='rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700'>{category}</span>
 </div>
 </div>

 <div className='flex items-center justify-between text-[13px] text-slate-500'>
 <span className='inline-flex items-center gap-1.5 truncate'>
 <KeyRound className='h-3.5 w-3.5 shrink-0' />
 {t('vault.protectedByPin')}
 </span>
 <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
 <Globe className='h-3.5 w-3.5 shrink-0' />
 <span>{updatedAt}</span>
 </span>
 </div>
 </Card>
 </div>
 </div>
 );
}
