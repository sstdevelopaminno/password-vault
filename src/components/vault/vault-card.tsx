'use client';

import { useMemo, useRef, useState } from 'react';
import { Globe, KeyRound, Link2Off, Mail, MessageCirclePlus, Pencil, Trash2 } from 'lucide-react';
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
    <div className='relative isolate overflow-hidden rounded-[28px]'>
      <div className='absolute inset-y-0 right-0 flex w-[124px] items-center justify-end gap-1.5 rounded-[28px] bg-[linear-gradient(180deg,#1a2f72,#16285f)] p-1.5'>
        <button
          type='button'
          onClick={() => {
            closeSwipe();
            onEdit(id);
          }}
          className='inline-flex h-full w-[54px] flex-col items-center justify-center rounded-[14px] bg-gradient-to-b from-indigo-600 to-blue-700 text-white shadow-[0_8px_16px_rgba(37,99,235,0.36)] transition hover:brightness-110'
        >
          <Pencil className='h-4 w-4' />
          <span className='mt-1 text-app-micro font-semibold'>{t('vaultDetail.edit')}</span>
        </button>

        <button
          type='button'
          onClick={() => {
            closeSwipe();
            onDelete(id);
          }}
          className='inline-flex h-full w-[54px] flex-col items-center justify-center rounded-[14px] bg-gradient-to-b from-rose-600 to-fuchsia-700 text-white shadow-[0_8px_16px_rgba(225,29,72,0.36)] transition hover:brightness-110'
        >
          <Trash2 className='h-4 w-4' />
          <span className='mt-1 text-app-micro font-semibold'>{t('vaultDetail.delete')}</span>
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
        <Card
          className='cv-auto space-y-2.5 rounded-[28px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,#162a66,#102353)] p-3.5 shadow-[var(--glow-soft)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(47,123,255,0.18)]'
          onClick={onCardClick}
        >
          <div className='flex items-start gap-3'>
            <span className='inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-1)] text-sky-300 shadow-[inset_0_0_18px_rgba(56,216,255,0.1)]'>
              <Mail className='h-6 w-6' />
            </span>

            <div className='min-w-0 flex-1'>
              <p className='line-clamp-1 text-app-h3 font-semibold text-slate-100'>{title}</p>
              <p className='mt-0.5 truncate text-app-body text-slate-200'>{username}</p>
            </div>

            <div className='shrink-0'>
              <span className='inline-flex max-w-[148px] items-center truncate rounded-full border border-fuchsia-300/65 bg-fuchsia-700 px-3 py-1 text-app-micro font-semibold text-fuchsia-100'>
                {category}
              </span>
            </div>
          </div>

          <div className='flex items-center justify-between gap-2 text-app-caption text-slate-200'>
            <span className='inline-flex items-center gap-1.5 truncate'>
              <KeyRound className='h-4 w-4 shrink-0 text-slate-300' />
              {t('vault.protectedByPin')}
            </span>
            <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
              <Globe className='h-4 w-4 shrink-0 text-slate-300' />
              <span>{updatedAt}</span>
            </span>
          </div>

          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-1.5'>
              {isSharedToTeam ? (
                <span
                  className='inline-flex items-center gap-1 rounded-full border border-emerald-300/45 bg-emerald-700 px-2 py-0.5 text-app-micro font-semibold text-emerald-100'
                  title={locale === 'th' ? 'แชร์ไปทีมแล้ว' : 'Shared to team'}
                >
                  <span className='h-2 w-2 rounded-full bg-emerald-400' />
                  {sharedCount}
                </span>
              ) : null}
              {pending ? (
                <span
                  className='inline-flex items-center gap-1 rounded-full border border-amber-300/45 bg-amber-700 px-2 py-0.5 text-app-micro font-semibold text-amber-100'
                  title={locale === 'th' ? 'รอซิงก์' : 'Pending sync'}
                >
                  <span className='h-2 w-2 rounded-full bg-amber-400' />
                  {locale === 'th' ? 'รอซิงก์' : 'Pending'}
                </span>
              ) : null}
            </div>

            <div className='flex items-center gap-1.5'>
              {onShare ? (
                <button
                  type='button'
                  onClick={(event) => {
                    event.stopPropagation();
                    closeSwipe();
                    onShare(id);
                  }}
                  className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/55 bg-cyan-700 text-cyan-100 transition hover:brightness-110'
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
                  className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/55 bg-rose-700 text-rose-100 transition hover:brightness-110'
                  title={locale === 'th' ? 'ยกเลิกแชร์ไปทีม' : 'Cancel team share'}
                  aria-label={locale === 'th' ? 'ยกเลิกแชร์ไปทีม' : 'Cancel team share'}
                >
                  <Link2Off className='h-4 w-4' />
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
