'use client';

import { useMemo, useRef, useState } from 'react';
import { Globe, KeyRound, Pencil, Trash2, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/provider';

type VaultCardProps = {
  id: string;
  title: string;
  username: string;
  updatedAt: string;
  category?: string;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

const ACTION_WIDTH = 136;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function VaultCard({ id, title, username, updatedAt, category = 'General', onOpen, onEdit, onDelete }: VaultCardProps) {
  const { t } = useI18n();

  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pointerIdRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const movedRef = useRef(false);

  const opened = useMemo(() => offsetX <= -ACTION_WIDTH + 2, [offsetX]);

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
    <div className='relative overflow-hidden rounded-[24px]'>
      <div className='absolute inset-y-0 right-0 flex w-[136px] items-center justify-end gap-2 rounded-[24px] bg-slate-100 p-2'>
        <button
          type='button'
          onClick={() => {
            closeSwipe();
            onEdit(id);
          }}
          className='inline-flex h-full w-[60px] flex-col items-center justify-center rounded-[16px] bg-gradient-to-b from-indigo-500 to-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)] transition hover:brightness-110'
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
          className='inline-flex h-full w-[60px] flex-col items-center justify-center rounded-[16px] bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-[0_8px_18px_rgba(225,29,72,0.28)] transition hover:brightness-110'
        >
          <Trash2 className='h-4 w-4' />
          <span className='mt-1 text-[10px] font-semibold'>{t('vaultDetail.delete')}</span>
        </button>
      </div>

      <div
        className='touch-pan-y transition-transform duration-200 ease-out will-change-transform'
        style={{ transform: `translate3d(${offsetX}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Card className='space-y-3 rounded-[24px] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(37,99,235,0.14)]' onClick={onCardClick}>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <h3 className='text-2xl font-semibold leading-tight text-slate-900'>{title}</h3>
              <p className='mt-2 inline-flex items-center gap-2 text-base leading-6 text-slate-500'>
                <UserRound className='h-4 w-4' />
                {username}
              </p>
            </div>
            <span className='rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700'>{category}</span>
          </div>

          <div className='flex items-center justify-between text-sm text-slate-500'>
            <span className='inline-flex items-center gap-1.5'>
              <KeyRound className='h-4 w-4' />
              {t('vault.protectedByPin')}
            </span>
            <span className='inline-flex items-center gap-1.5'>
              <Globe className='h-4 w-4' />
              {updatedAt}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
