'use client';

import Link from 'next/link';
import { BadgeCheck, Boxes, CircleHelp, Users } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';

export default function PackageCheckPage() {
  const { t } = useI18n();

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <header className='neon-panel rounded-[24px] p-4'>
        <p className='text-app-caption text-slate-300'>{t('packages.checkSubtitle')}</p>
        <h1 className='mt-1 text-app-h3 font-semibold text-slate-100'>{t('packages.checkTitle')}</h1>
      </header>

      <article className='relative overflow-hidden rounded-[22px] border border-[rgba(139,186,255,0.38)] bg-[linear-gradient(150deg,rgba(21,42,111,0.93),rgba(11,24,70,0.97))] p-4 shadow-[0_16px_34px_rgba(14,46,120,0.35)]'>
        <span className='absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(72,196,255,0.35),transparent_72%)]' />
        <div className='relative z-10 space-y-3'>
          <span className='inline-flex items-center gap-2 rounded-full border border-cyan-300/50 bg-cyan-300/10 px-3 py-1 text-app-micro font-semibold text-cyan-100'>
            <BadgeCheck className='h-3.5 w-3.5' />
            {t('packages.activeBadge')}
          </span>
          <h2 className='text-2xl font-semibold text-slate-50'>{t('packages.activeName')}</h2>
          <p className='text-app-caption leading-relaxed text-slate-200'>{t('packages.activeDesc')}</p>
          <div className='grid grid-cols-3 gap-2'>
            <div className='rounded-2xl border border-[rgba(154,195,255,0.32)] bg-[rgba(14,30,80,0.66)] p-2.5'>
              <p className='text-[10px] text-slate-300'>{t('packages.statWorkspace')}</p>
              <p className='mt-1 text-app-body font-semibold text-slate-100'>{t('packages.statWorkspaceValue')}</p>
            </div>
            <div className='rounded-2xl border border-[rgba(154,195,255,0.32)] bg-[rgba(14,30,80,0.66)] p-2.5'>
              <p className='text-[10px] text-slate-300'>{t('packages.statMembers')}</p>
              <p className='mt-1 text-app-body font-semibold text-slate-100'>{t('packages.statMembersValue')}</p>
            </div>
            <div className='rounded-2xl border border-[rgba(154,195,255,0.32)] bg-[rgba(14,30,80,0.66)] p-2.5'>
              <p className='text-[10px] text-slate-300'>{t('packages.statSupport')}</p>
              <p className='mt-1 text-app-body font-semibold text-slate-100'>{t('packages.statSupportValue')}</p>
            </div>
          </div>
        </div>
      </article>

      <div className='neon-soft-panel rounded-[20px] p-3'>
        <p className='flex items-start gap-2 text-app-caption leading-relaxed text-slate-200'>
          <CircleHelp className='mt-0.5 h-4 w-4 shrink-0 text-cyan-200' />
          {t('packages.compareHint')}
        </p>
        <div className='mt-3 grid grid-cols-2 gap-2'>
          <Link href='/our-packages'>
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption'>
              <Boxes className='mr-1 h-4 w-4' />
              {t('packages.plansTitle')}
            </Button>
          </Link>
          <Link href='/wallet'>
            <Button type='button' variant='secondary' className='h-10 w-full rounded-xl text-app-caption'>
              <Users className='mr-1 h-4 w-4' />
              {t('packages.walletTitle')}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

