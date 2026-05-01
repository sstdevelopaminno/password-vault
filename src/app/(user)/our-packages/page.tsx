'use client';

import { useMemo, useState } from 'react';
import { Check, Crown, Rocket, Shield } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';

type BillingCycle = 'monthly' | 'yearly';

type Plan = {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  icon: typeof Rocket;
  recommended?: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 0,
    priceYearly: 0,
    icon: Rocket,
    features: ['1 GB storage', '1 team member', 'Basic notes & scanner'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 199,
    priceYearly: 1990,
    icon: Crown,
    recommended: true,
    features: ['30 GB storage', '10 team members', 'Priority sync and export'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 599,
    priceYearly: 5990,
    icon: Shield,
    features: ['200 GB storage', 'Unlimited team members', 'Advanced security controls'],
  },
];

export default function OurPackagesPage() {
  const { locale, t } = useI18n();
  const isThai = locale === 'th';
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const cycleLabel = useMemo(() => (cycle === 'monthly' ? t('packages.monthly') : t('packages.yearly')), [cycle, t]);

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <header className='neon-panel rounded-[24px] p-4'>
        <p className='text-app-caption text-slate-300'>{t('packages.plansSubtitle')}</p>
        <h1 className='mt-1 text-app-h3 font-semibold text-slate-100'>{t('packages.plansTitle')}</h1>
        <div className='mt-3 inline-flex rounded-2xl border border-[rgba(155,188,255,0.34)] bg-[rgba(20,36,89,0.68)] p-1'>
          <button
            type='button'
            onClick={() => setCycle('monthly')}
            className={
              'rounded-xl px-3 py-1.5 text-app-caption font-semibold transition ' +
              (cycle === 'monthly' ? 'bg-[rgba(78,146,255,0.88)] text-slate-100' : 'text-slate-300')
            }
          >
            {t('packages.monthly')}
          </button>
          <button
            type='button'
            onClick={() => setCycle('yearly')}
            className={
              'rounded-xl px-3 py-1.5 text-app-caption font-semibold transition ' +
              (cycle === 'yearly' ? 'bg-[rgba(78,146,255,0.88)] text-slate-100' : 'text-slate-300')
            }
          >
            {t('packages.yearly')}
          </button>
        </div>
      </header>

      <div className='space-y-2'>
        {plans.map((plan) => {
          const Icon = plan.icon;
          const price = cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
          const isFree = price === 0;
          return (
            <article
              key={plan.id}
              className={
                'relative overflow-hidden rounded-[22px] border p-3.5 shadow-[0_12px_28px_rgba(11,42,115,0.24)] ' +
                (plan.recommended
                  ? 'border-cyan-300/60 bg-[linear-gradient(150deg,rgba(20,52,136,0.95),rgba(14,30,86,0.98))]'
                  : 'border-[rgba(155,188,255,0.34)] bg-[linear-gradient(150deg,rgba(19,38,102,0.93),rgba(11,24,68,0.98))]')
              }
            >
              <span className='absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(111,198,255,0.26),transparent_72%)]' />
              <div className='relative z-10'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='inline-flex items-center gap-1 text-app-caption font-semibold text-slate-200'>
                      <Icon className='h-4 w-4 text-cyan-200' />
                      {plan.name}
                    </p>
                    <h2 className='mt-1 text-[24px] font-semibold leading-none text-slate-50'>
                      {isFree ? (isThai ? 'ฟรี' : 'Free') : '฿' + price.toLocaleString()}
                    </h2>
                    <p className='mt-1 text-app-micro text-slate-300'>{cycleLabel}</p>
                  </div>
                  {plan.recommended ? (
                    <span className='rounded-full border border-fuchsia-300/60 bg-fuchsia-300/15 px-2 py-1 text-[10px] font-semibold text-fuchsia-100'>
                      {t('packages.recommended')}
                    </span>
                  ) : null}
                </div>
                <ul className='mt-3 space-y-1.5'>
                  {plan.features.map((item) => (
                    <li key={item} className='flex items-center gap-1.5 text-app-caption text-slate-200'>
                      <Check className='h-3.5 w-3.5 text-cyan-200' />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button type='button' className='mt-3 h-10 w-full rounded-xl text-app-caption'>
                  {t('packages.choosePlan')}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

