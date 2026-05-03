'use client';

import { ArrowDownCircle, ArrowUpCircle, BanknoteArrowUp, CircleDollarSign, CreditCard } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';

const sampleTransactions = [
  { id: 't1', label: 'Top up via PromptPay', amount: +500, date: '2026-05-01 13:10' },
  { id: 't2', label: 'Pro plan (monthly)', amount: -199, date: '2026-04-28 09:42' },
  { id: 't3', label: 'Top up via Card', amount: +300, date: '2026-04-17 20:11' },
];

export default function WalletPage() {
  const { locale, t } = useI18n();
  const balance = 1280;

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <header className='neon-panel rounded-[24px] p-4'>
        <p className='text-app-caption text-slate-300'>{t('packages.walletSubtitle')}</p>
        <h1 className='mt-1 text-app-h3 font-semibold text-slate-100'>{t('packages.walletTitle')}</h1>
      </header>

      <article className='relative overflow-hidden rounded-[24px] border border-[rgba(152,190,255,0.38)] bg-[linear-gradient(145deg,rgba(20,47,120,0.94),rgba(12,28,76,0.98))] p-4 shadow-[0_18px_38px_rgba(10,44,124,0.34)]'>
        <span className='absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(120,215,255,0.32),transparent_70%)]' />
        <div className='relative z-10'>
          <p className='text-app-caption text-slate-300'>{t('packages.balanceLabel')}</p>
          <p className='mt-1 text-[34px] font-semibold leading-none text-cyan-100'>{t('packages.baht')} {balance.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US')}</p>
          <div className='mt-3 grid grid-cols-2 gap-2'>
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption'>
              <BanknoteArrowUp className='mr-1 h-4 w-4' />
              {t('packages.topupAction')}
            </Button>
            <Button type='button' variant='secondary' className='h-10 w-full rounded-xl text-app-caption'>
              <CreditCard className='mr-1 h-4 w-4' />
              {t('packages.payAction')}
            </Button>
          </div>
        </div>
      </article>

      <section className='neon-soft-panel rounded-[20px] p-3'>
        <h2 className='text-app-body font-semibold text-slate-100'>{t('packages.historyTitle')}</h2>
        <div className='mt-2 space-y-2'>
          {sampleTransactions.map((item) => {
            const incoming = item.amount > 0;
            return (
              <article key={item.id} className='rounded-2xl border border-[rgba(146,186,255,0.28)] bg-[rgba(17,33,84,0.68)] px-3 py-2.5'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='line-clamp-1 text-app-caption font-semibold text-slate-100'>{item.label}</p>
                    <p className='mt-0.5 text-app-micro text-slate-300'>{item.date}</p>
                  </div>
                  <p className={'inline-flex items-center gap-1 text-app-caption font-semibold ' + (incoming ? 'text-emerald-200' : 'text-rose-200')}>
                    {incoming ? <ArrowDownCircle className='h-3.5 w-3.5' /> : <ArrowUpCircle className='h-3.5 w-3.5' />}
                    {(incoming ? '+' : '-') + t('packages.baht') + ' ' + Math.abs(item.amount).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US')}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        <p className='mt-2 text-app-micro text-slate-300'>
          <CircleDollarSign className='mr-1 inline h-3.5 w-3.5 align-[-1px]' />
          {t('packages.walletIntegrationHint')}
        </p>
      </section>
    </section>
  );
}


