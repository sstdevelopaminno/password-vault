'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, CircleDollarSign, Crown, QrCode, Rocket, Shield } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type BillingCycle = 'monthly' | 'yearly';

type PlanResponse = {
  id: string;
  name: string;
  summary: string;
  suitability: string;
  isFree: boolean;
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

type PaymentMethod = 'wallet' | 'promptpay';

type WalletSummary = {
  balanceThb: number;
};

type CurrentPackagePayload = {
  subscription: {
    id: string;
    status: 'active' | 'trialing' | 'expired' | 'canceled';
    cycle: BillingCycle | null;
    startsAt: string;
    endsAt: string | null;
  };
  plan: {
    id: string;
    name: string;
  };
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
  const [slipImageName, setSlipImageName] = useState('');
  const [uploadingSlipImage, setUploadingSlipImage] = useState(false);
  const [paymentPlanId, setPaymentPlanId] = useState<string | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary>({ balanceThb: 0 });
  const [loadingWalletSummary, setLoadingWalletSummary] = useState(false);
  const [currentPackage, setCurrentPackage] = useState<CurrentPackagePayload | null>(null);

  const cycleLabel = useMemo(() => (cycle === 'monthly' ? t('packages.monthly') : t('packages.yearly')), [cycle, t]);
  const paymentPlan = useMemo(() => plans.find((plan) => plan.id === paymentPlanId) ?? null, [plans, paymentPlanId]);
  const paymentAmount = useMemo(() => {
    if (!paymentPlan) return 0;
    return cycle === 'monthly' ? paymentPlan.monthlyPriceThb : paymentPlan.yearlyPriceThb;
  }, [paymentPlan, cycle]);
  const walletEnough = walletSummary.balanceThb >= paymentAmount;
  const formatPriceLabel = (amount: number) =>
    isThai ? `${amount.toLocaleString('th-TH')} ${t('packages.baht')}` : `${t('packages.baht')} ${amount.toLocaleString('en-US')}`;

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

  useEffect(() => {
    let mounted = true;
    async function loadCurrentPackage() {
      try {
        const response = await fetch(`/api/packages/current?locale=${locale}`, { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as CurrentPackagePayload & { error?: string };
        if (!mounted) return;
        if (!response.ok || !payload?.plan?.id) return;
        setCurrentPackage(payload);
      } catch {
        // ignore summary error on package page
      }
    }
    void loadCurrentPackage();
    return () => {
      mounted = false;
    };
  }, [locale]);

  useEffect(() => {
    if (!paymentPlan) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [paymentPlan]);

  async function reloadWalletSummary() {
    setLoadingWalletSummary(true);
    try {
      const response = await fetch('/api/packages/wallet', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as Partial<WalletSummary> & { error?: string };
      if (!response.ok) {
        throw new Error(String(payload.error ?? 'Failed to load wallet summary'));
      }
      setWalletSummary({
        balanceThb: Number(payload.balanceThb ?? 0),
      });
    } finally {
      setLoadingWalletSummary(false);
    }
  }

  async function submitCheckout(planId: string, paymentMethod: PaymentMethod) {
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
          paymentMethod,
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
        setPaymentPlanId(null);
        setSlipAmount(String(order.uniqueAmountThb));
        setStatusMessage(t('packages.createdOrder'));
        return;
      }

      setCheckoutOrder(null);
      setPaymentPlanId(null);
      setStatusMessage(t('packages.activated'));
      setCurrentPackage((prev) =>
        prev
          ? {
              ...prev,
              plan: {
                id: planId,
                name: plans.find((plan) => plan.id === planId)?.name ?? prev.plan.name,
              },
              subscription: {
                ...prev.subscription,
                status: 'active',
                cycle,
              },
            }
          : prev,
      );
      await reloadWalletSummary().catch(() => undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('packages.checkoutFailed'));
    } finally {
      setProcessingPlanId(null);
    }
  }

  async function choosePlan(planId: string) {
    const target = plans.find((plan) => plan.id === planId);
    if (!target) return;
    if (target.id === 'free_pro_trial') {
      await submitCheckout(planId, 'promptpay');
      return;
    }
    if (target.isFree) return;
    const amount = cycle === 'monthly' ? target.monthlyPriceThb : target.yearlyPriceThb;

    if (amount <= 0) {
      await submitCheckout(planId, 'promptpay');
      return;
    }

    setPaymentPlanId(planId);
    setCheckoutOrder(null);
    setErrorMessage('');
    setStatusMessage('');
    await reloadWalletSummary().catch(() => undefined);
  }

  async function cancelCurrentPaidPackage() {
    setErrorMessage('');
    setStatusMessage('');
    try {
      const response = await fetch('/api/packages/cancel', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(String(payload.error ?? 'Unable to cancel package'));
      }
      setCurrentPackage((prev) =>
        prev
          ? {
              ...prev,
              plan: {
                id: 'free_starter',
                name: isThai ? 'ฟรี' : 'Free',
              },
              subscription: {
                ...prev.subscription,
                status: 'active',
                cycle: null,
              },
            }
          : prev,
      );
      setPaymentPlanId(null);
      setCheckoutOrder(null);
      setStatusMessage(isThai ? 'ยกเลิกแพ็กเกจสำเร็จ ระบบกลับไป Free Starter แล้ว' : 'Package canceled. Account is now on Free Starter.');
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Unable to cancel package'));
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
        setSlipImageName('');
      } else {
        setErrorMessage(t('packages.slipFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('packages.verifyFailed'));
    } finally {
      setVerifyingSlip(false);
    }
  }

  async function handleSlipImageUpload(file: File | null) {
    if (!file) return;
    setUploadingSlipImage(true);
    setErrorMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/packages/slip/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; slipImageUrl?: string };
      if (!response.ok || !payload.slipImageUrl) {
        throw new Error(String(payload.error ?? 'Slip image upload failed'));
      }
      setSlipImageUrl(payload.slipImageUrl);
      setSlipImageName(file.name || 'slip-image');
      setStatusMessage(isThai ? 'อัปโหลดรูปสลิปแล้ว กรุณายืนยันการชำระเงิน' : 'Slip image uploaded. Please verify payment.');
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Slip image upload failed'));
    } finally {
      setUploadingSlipImage(false);
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

      {paymentPlan ? (
        <div className='fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(4,10,34,0.78)] p-3' onClick={() => setPaymentPlanId(null)}>
          <section
            className='w-full max-w-md space-y-3 rounded-[22px] border border-cyan-300/50 bg-[linear-gradient(150deg,rgba(18,43,116,0.98),rgba(9,21,70,1))] p-4 shadow-[0_22px_48px_rgba(5,13,46,0.65)]'
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2 className='text-app-h4 font-semibold text-slate-100'>{isThai ? 'เลือกวิธีชำระเงิน' : 'Choose payment method'}</h2>
              <p className='mt-1 text-app-caption text-slate-200'>
                {paymentPlan.name} • {formatPriceLabel(paymentAmount)}
              </p>
            </div>

            <div className='rounded-xl border border-[rgba(155,188,255,0.26)] bg-[rgba(11,22,56,0.65)] p-3'>
              <p className='text-app-micro text-slate-300'>{isThai ? 'ยอดคงเหลือกระเป๋าเงิน' : 'Wallet balance'}</p>
              <p className='mt-1 text-app-body font-semibold text-slate-100'>
                {loadingWalletSummary ? t('common.loading') : formatPriceLabel(walletSummary.balanceThb)}
              </p>
              {!walletEnough ? (
                <p className='mt-1 text-app-micro text-amber-200'>{isThai ? 'ยอดเงินไม่พอ กรุณาเติมเงินหรือเลือกวิธี QR' : 'Insufficient wallet balance. Please top up or use QR.'}</p>
              ) : null}
            </div>

            <div className='grid grid-cols-1 gap-2'>
              <Button
                type='button'
                disabled={processingPlanId === paymentPlan.id || !walletEnough}
                onClick={() => void submitCheckout(paymentPlan.id, 'wallet')}
                className='h-10 w-full rounded-xl text-app-caption'
              >
                <CircleDollarSign className='mr-1 h-4 w-4' />
                {isThai ? 'ชำระทันทีด้วยกระเป๋าเงิน' : 'Pay now with wallet'}
              </Button>

              <Button
                type='button'
                variant='secondary'
                disabled={processingPlanId === paymentPlan.id}
                onClick={() => void submitCheckout(paymentPlan.id, 'promptpay')}
                className='h-10 w-full rounded-xl text-app-caption'
              >
                <QrCode className='mr-1 h-4 w-4' />
                {isThai ? 'ชำระทันทีด้วย QR พร้อมเพย์' : 'Pay now by PromptPay QR'}
              </Button>
              <Button
                type='button'
                variant='secondary'
                disabled={processingPlanId === paymentPlan.id}
                onClick={() => setPaymentPlanId(null)}
                className='h-10 w-full rounded-xl text-app-caption'
              >
                {isThai ? 'ยกเลิก' : 'Cancel'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      <div className='space-y-2'>
        {(loading ? [] : plans).map((plan) => {
          const Icon = iconsByPlan[plan.id] ?? Rocket;
          const price = cycle === 'monthly' ? plan.monthlyPriceThb : plan.yearlyPriceThb;
          const isFree = price === 0;
          const isTrialPlan = plan.id === 'free_pro_trial';
          const isCurrentPlan = currentPackage?.plan.id === plan.id;
          const isCurrentPaidPlan = isCurrentPlan && !isFree;
          const isCurrentTrialPlan = isCurrentPlan && isTrialPlan;

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
                      {isFree ? t('packages.freeLabel') : formatPriceLabel(price)}
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
                {!isFree ? (
                  <Button
                    type='button'
                    disabled={processingPlanId === plan.id}
                    onClick={() => {
                      if (isCurrentPaidPlan) {
                        void cancelCurrentPaidPackage();
                        return;
                      }
                      void choosePlan(plan.id);
                    }}
                    className='mt-3 h-10 w-full rounded-xl text-app-caption'
                  >
                    {isCurrentPaidPlan ? (isThai ? 'ยกเลิกแพ็กเกจ' : 'Cancel package') : t('packages.choosePlan')}
                  </Button>
                ) : isTrialPlan ? (
                  <Button
                    type='button'
                    disabled={processingPlanId === plan.id || isCurrentTrialPlan}
                    onClick={() => {
                      void choosePlan(plan.id);
                    }}
                    className='mt-3 h-10 w-full rounded-xl text-app-caption'
                  >
                    {isCurrentTrialPlan
                      ? (isThai ? 'กำลังทดลองใช้ฟรี' : 'Trial is active')
                      : (isThai ? 'เริ่มทดลองใช้ฟรี 14 วัน' : 'Start 14-day free trial')}
                  </Button>
                ) : (
                  <div className='mt-3 h-10 w-full rounded-xl border border-[rgba(154,195,255,0.32)] bg-[rgba(14,30,80,0.5)] px-3 py-2 text-center text-app-caption font-semibold text-slate-200'>
                    {isThai ? 'แพ็กเกจฟรีใช้งานอัตโนมัติเมื่อเริ่มต้น' : 'Free package is applied automatically for first signup'}
                  </div>
                )}
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
              <p className='font-semibold'>{formatPriceLabel(checkoutOrder.uniqueAmountThb)}</p>
            </div>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{t('packages.paymentExpires')}</p>
              <p className='font-semibold'>{new Date(checkoutOrder.expiresAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
            </div>
          </div>

          <Image
            src={checkoutOrder.promptpayQrUrl}
            alt='PromptPay QR'
            width={192}
            height={192}
            unoptimized
            className='mx-auto h-48 w-48 rounded-xl bg-white p-2'
          />

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
            <Input
              type='file'
              accept='image/*'
              disabled={uploadingSlipImage || verifyingSlip}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleSlipImageUpload(file);
                event.currentTarget.value = '';
              }}
            />
            {slipImageName ? <p className='text-app-micro text-slate-300'>{isThai ? `ไฟล์สลิป: ${slipImageName}` : `Slip file: ${slipImageName}`}</p> : null}
            <Input value={slipImageUrl} onChange={(event) => setSlipImageUrl(event.target.value)} placeholder={t('packages.slipImageUrl')} />
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption' disabled={verifyingSlip || uploadingSlipImage} onClick={submitSlipVerification}>
              {verifyingSlip ? t('packages.slipSubmitting') : t('packages.slipSubmit')}
            </Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}


