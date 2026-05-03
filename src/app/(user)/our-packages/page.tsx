'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Rocket, Shield } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type BillingCycle = 'monthly' | 'yearly';

type PlanResponse = {
  id: string;
  name: string;
  summary: string;
  suitability: string;
  monthlyPriceThb: number;
  yearlyPriceThb: number;
  recommended?: boolean;
  features: string[];
  limits: string[];
};

type CheckoutOrder = {
  id: string;
  planId: string;
  cycle: BillingCycle;
  status: string;
  baseAmountThb: number;
  uniqueAmountThb: number;
  currency: string;
  promptpayTarget: string;
  promptpayQrUrl: string;
  expiresAt: string;
  createdAt: string;
};

const iconsByPlan: Record<string, typeof Rocket> = {
  free_starter: Rocket,
  free_pro_trial: Rocket,
  lite: Rocket,
  pro: Crown,
  business: Shield,
};

export default function OurPackagesPage() {
  const { locale, t } = useI18n();
  const isThai = locale === 'th';
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [verifyingSlip, setVerifyingSlip] = useState(false);
  const [slipReference, setSlipReference] = useState('');
  const [slipAmount, setSlipAmount] = useState('');
  const [slipReceiver, setSlipReceiver] = useState('');
  const [slipPayer, setSlipPayer] = useState('');
  const [slipPayerName, setSlipPayerName] = useState('');
  const [slipTransferredAt, setSlipTransferredAt] = useState('');
  const [slipImageUrl, setSlipImageUrl] = useState('');

  const cycleLabel = useMemo(() => (cycle === 'monthly' ? t('packages.monthly') : t('packages.yearly')), [cycle, t]);

  useEffect(() => {
    let mounted = true;

    async function loadPlans() {
      setLoading(true);
      setErrorMessage('');
      try {
        const response = await fetch(`/api/packages/plans?locale=${locale}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload.error ?? t('packages.loadFailed')));
        }
        if (!mounted) return;
        setPlans(Array.isArray(payload.plans) ? payload.plans : []);
      } catch {
        if (!mounted) return;
        setErrorMessage(t('packages.loadFailed'));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadPlans();
    return () => {
      mounted = false;
    };
  }, [locale, t]);

  async function choosePlan(planId: string) {
    setProcessingPlanId(planId);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch('/api/packages/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId,
          cycle,
          locale,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : t('packages.checkoutFailed'));
      }

      if (payload.mode === 'payment_required' && payload.order) {
        const order = payload.order as CheckoutOrder;
        setCheckoutOrder(order);
        setSlipAmount(String(order.uniqueAmountThb));
        setStatusMessage(t('packages.createdOrder'));
        return;
      }

      setCheckoutOrder(null);
      setStatusMessage(t('packages.activated'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('packages.checkoutFailed'));
    } finally {
      setProcessingPlanId(null);
    }
  }

  async function submitSlipVerification() {
    if (!checkoutOrder) return;

    setVerifyingSlip(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch('/api/packages/slip/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: checkoutOrder.id,
          provider: 'manual',
          reference: slipReference || null,
          amountThb: slipAmount ? Number(slipAmount) : null,
          receiverAccount: slipReceiver || null,
          payerAccount: slipPayer || null,
          payerName: slipPayerName || null,
          transferredAt: slipTransferredAt ? new Date(slipTransferredAt).toISOString() : null,
          slipImageUrl: slipImageUrl || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : t('packages.verifyFailed'));
      }

      if (payload.verified) {
        setStatusMessage(t('packages.slipSuccess'));
        setCheckoutOrder(null);
        setSlipReference('');
        setSlipReceiver('');
        setSlipPayer('');
        setSlipPayerName('');
        setSlipTransferredAt('');
        setSlipImageUrl('');
      } else {
        setErrorMessage(t('packages.slipFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('packages.verifyFailed'));
    } finally {
      setVerifyingSlip(false);
    }
  }

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <header className='neon-panel rounded-[24px] p-4'>
        <p className='text-app-caption text-slate-300'>{t('packages.introSubtitle')}</p>
        <h1 className='mt-1 text-app-h3 font-semibold text-slate-100'>{t('packages.introTitle')}</h1>
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

      {statusMessage ? (
        <p className='rounded-2xl border border-emerald-300/50 bg-emerald-400/10 px-3 py-2 text-app-caption text-emerald-100'>{statusMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className='rounded-2xl border border-rose-300/50 bg-rose-400/10 px-3 py-2 text-app-caption text-rose-100'>{errorMessage}</p>
      ) : null}

      <div className='space-y-2'>
        {(loading ? [] : plans).map((plan) => {
          const Icon = iconsByPlan[plan.id] ?? Rocket;
          const price = cycle === 'monthly' ? plan.monthlyPriceThb : plan.yearlyPriceThb;
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
                      {isFree ? t('packages.freeLabel') : `${t('packages.baht')} ${price.toLocaleString(isThai ? 'th-TH' : 'en-US')}`}
                    </h2>
                    <p className='mt-1 text-app-micro text-slate-300'>{isFree ? cycleLabel : cycle === 'monthly' ? t('packages.perMonth') : t('packages.perYear')}</p>
                  </div>
                  {plan.recommended ? (
                    <span className='rounded-full border border-fuchsia-300/60 bg-fuchsia-300/15 px-2 py-1 text-[10px] font-semibold text-fuchsia-100'>
                      {t('packages.recommended')}
                    </span>
                  ) : null}
                </div>
                <p className='mt-2 text-app-caption text-slate-200'>{plan.summary}</p>
                <p className='mt-1 text-app-micro text-slate-300'>{plan.suitability}</p>
                <ul className='mt-3 space-y-1.5'>
                  {plan.features.map((item) => (
                    <li key={item} className='flex items-center gap-1.5 text-app-caption text-slate-200'>
                      <Check className='h-3.5 w-3.5 text-cyan-200' />
                      {item}
                    </li>
                  ))}
                </ul>
                <ul className='mt-2 space-y-1'>
                  {plan.limits.map((item) => (
                    <li key={item} className='text-app-micro text-slate-300'>
                      • {item}
                    </li>
                  ))}
                </ul>
                <Button
                  type='button'
                  disabled={processingPlanId === plan.id}
                  onClick={() => choosePlan(plan.id)}
                  className='mt-3 h-10 w-full rounded-xl text-app-caption'
                >
                  {t('packages.choosePlan')}
                </Button>
              </div>
            </article>
          );
        })}

        {loading ? (
          <article className='rounded-[22px] border border-[rgba(155,188,255,0.34)] bg-[rgba(15,31,83,0.7)] p-4 text-app-caption text-slate-200'>
            {t('common.loading')}
          </article>
        ) : null}
      </div>

      {checkoutOrder ? (
        <section className='space-y-3 rounded-[22px] border border-cyan-300/50 bg-[linear-gradient(150deg,rgba(18,43,116,0.95),rgba(9,21,70,0.98))] p-4'>
          <div>
            <h2 className='text-app-h4 font-semibold text-slate-100'>{t('packages.paymentTitle')}</h2>
            <p className='mt-1 text-app-caption text-slate-200'>{t('packages.paymentSubtitle')}</p>
          </div>

          <div className='grid grid-cols-2 gap-2 text-app-caption text-slate-100'>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{t('packages.paymentAmount')}</p>
              <p className='font-semibold'>{t('packages.baht')} {checkoutOrder.uniqueAmountThb.toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
            </div>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{t('packages.paymentExpires')}</p>
              <p className='font-semibold'>{new Date(checkoutOrder.expiresAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
            </div>
          </div>

          <img src={checkoutOrder.promptpayQrUrl} alt='PromptPay QR' className='mx-auto h-48 w-48 rounded-xl bg-white p-2' />

          <p className='text-app-micro text-slate-200'>{t('packages.paymentHowto1')}</p>
          <p className='text-app-micro text-slate-200'>{t('packages.paymentHowto2')}</p>
          <p className='text-app-micro text-slate-200'>{t('packages.paymentHowto3')}</p>
          <p className='text-app-micro text-slate-200'>{t('packages.paymentHowto4')}</p>

          <div className='space-y-2 rounded-xl border border-[rgba(155,188,255,0.26)] bg-[rgba(11,22,56,0.65)] p-3'>
            <h3 className='text-app-caption font-semibold text-slate-100'>{t('packages.slipTitle')}</h3>
            <Input value={slipReference} onChange={(event) => setSlipReference(event.target.value)} placeholder={t('packages.slipReference')} />
            <Input value={slipAmount} onChange={(event) => setSlipAmount(event.target.value)} placeholder={t('packages.slipAmount')} inputMode='decimal' />
            <Input value={slipReceiver} onChange={(event) => setSlipReceiver(event.target.value)} placeholder={t('packages.slipReceiver')} />
            <Input value={slipPayer} onChange={(event) => setSlipPayer(event.target.value)} placeholder={t('packages.slipPayer')} />
            <Input value={slipPayerName} onChange={(event) => setSlipPayerName(event.target.value)} placeholder={t('packages.slipPayerName')} />
            <Input value={slipTransferredAt} onChange={(event) => setSlipTransferredAt(event.target.value)} placeholder={t('packages.slipTransferredAt')} type='datetime-local' />
            <Input value={slipImageUrl} onChange={(event) => setSlipImageUrl(event.target.value)} placeholder={t('packages.slipImageUrl')} />
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption' disabled={verifyingSlip} onClick={submitSlipVerification}>
              {verifyingSlip ? t('packages.slipSubmitting') : t('packages.slipSubmit')}
            </Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}


