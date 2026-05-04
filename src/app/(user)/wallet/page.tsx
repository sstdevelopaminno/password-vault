'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, BanknoteArrowUp, CircleDollarSign, CreditCard, QrCode } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type WalletTransaction = {
  id: string;
  label: string;
  direction: 'out' | 'in';
  amountThb: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired' | 'rejected';
  paidAt: string | null;
  createdAt: string;
};

type WalletPayload = {
  balanceThb: number;
  spentThb: number;
  transactions: WalletTransaction[];
};

type TopupOrder = {
  id: string;
  status: string;
  baseAmountThb: number;
  uniqueAmountThb: number;
  currency: string;
  promptpayTarget: string;
  promptpayQrUrl: string;
  expiresAt: string;
  createdAt: string;
};

function defaultPayload(): WalletPayload {
  return {
    balanceThb: 0,
    spentThb: 0,
    transactions: [],
  };
}

function translateStatus(status: WalletTransaction['status']) {
  if (status === 'paid') return 'Paid';
  if (status === 'expired') return 'Expired';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

export default function WalletPage() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const isThai = locale === 'th';
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [wallet, setWallet] = useState<WalletPayload>(defaultPayload);
  const [topupOrder, setTopupOrder] = useState<TopupOrder | null>(null);
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

  const loadWalletPayload = useCallback(async () => {
    const response = await fetch('/api/packages/wallet', { cache: 'no-store' });
    const payload = (await response.json().catch(() => ({}))) as Partial<WalletPayload> & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || (isThai ? 'Load wallet failed' : 'Failed to load wallet'));
    }
    return {
      balanceThb: Number(payload.balanceThb ?? 0),
      spentThb: Number(payload.spentThb ?? 0),
      transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
    } satisfies WalletPayload;
  }, [isThai]);

  useEffect(() => {
    let mounted = true;

    async function loadWallet() {
      setLoading(true);
      setErrorMessage('');
      try {
        const nextWallet = await loadWalletPayload();
        if (!mounted) return;
        setWallet(nextWallet);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(String(error instanceof Error ? error.message : isThai ? 'Load wallet failed' : 'Failed to load wallet'));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadWallet();
    return () => {
      mounted = false;
    };
  }, [isThai, loadWalletPayload]);

  const balanceText = useMemo(
    () => wallet.balanceThb.toLocaleString(isThai ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [isThai, wallet.balanceThb],
  );

  const spentText = useMemo(
    () => wallet.spentThb.toLocaleString(isThai ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [isThai, wallet.spentThb],
  );

  async function handleTopupCreate() {
    const input = window.prompt(isThai ? 'Top up amount (THB)' : 'Top up amount (THB)', '500');
    if (!input) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Invalid top-up amount');
      return;
    }

    setErrorMessage('');
    setStatusMessage('');
    try {
      const response = await fetch('/api/packages/wallet/topup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountThb: amount }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; order?: TopupOrder };
      if (!response.ok || !payload.order) {
        throw new Error(String(payload.error ?? 'Top-up order failed'));
      }

      setTopupOrder(payload.order);
      setSlipAmount(String(payload.order.uniqueAmountThb));
      setStatusMessage(isThai ? 'Created top-up QR order.' : 'Created top-up QR order.');
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Top-up order failed'));
    }
  }

  async function submitTopupSlipVerification() {
    if (!topupOrder) return;

    setVerifyingSlip(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch('/api/packages/wallet/topup/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topupOrderId: topupOrder.id,
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string; verified?: boolean; reason?: string[] };
      if (!response.ok) {
        throw new Error(String(payload.error ?? 'Top-up slip verification failed'));
      }
      if (!payload.verified) {
        throw new Error(`Slip verification failed: ${(payload.reason ?? []).join(',')}`);
      }

      setStatusMessage(isThai ? 'Top-up success. Wallet updated.' : 'Top-up success. Wallet updated.');
      setTopupOrder(null);
      setSlipReference('');
      setSlipAmount('');
      setSlipReceiver('');
      setSlipPayer('');
      setSlipPayerName('');
      setSlipTransferredAt('');
      setSlipImageUrl('');
      setSlipImageName('');
      const nextWallet = await loadWalletPayload();
      setWallet(nextWallet);
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Top-up slip verification failed'));
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
      setStatusMessage(isThai ? 'อัปโหลดรูปสลิปแล้ว กรุณายืนยันสลิป' : 'Slip image uploaded. Please verify slip.');
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Slip image upload failed'));
    } finally {
      setUploadingSlipImage(false);
    }
  }

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <header className='neon-panel rounded-[24px] p-4'>
        <p className='text-app-caption text-slate-300'>{t('packages.walletSubtitle')}</p>
        <h1 className='mt-1 text-app-h3 font-semibold text-slate-100'>{t('packages.walletTitle')}</h1>
      </header>

      {statusMessage ? (
        <p className='rounded-2xl border border-emerald-300/50 bg-emerald-400/10 px-3 py-2 text-app-caption text-emerald-100'>{statusMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className='rounded-2xl border border-rose-300/50 bg-rose-400/10 px-3 py-2 text-app-caption text-rose-100'>{errorMessage}</p>
      ) : null}

      <article className='relative overflow-hidden rounded-[24px] border border-[rgba(152,190,255,0.38)] bg-[linear-gradient(145deg,rgba(20,47,120,0.94),rgba(12,28,76,0.98))] p-4 shadow-[0_18px_38px_rgba(10,44,124,0.34)]'>
        <span className='absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(120,215,255,0.32),transparent_70%)]' />
        <div className='relative z-10'>
          <p className='text-app-caption text-slate-300'>{t('packages.balanceLabel')}</p>
          <p className='mt-1 text-[34px] font-semibold leading-none text-cyan-100'>{t('packages.baht')} {balanceText}</p>
          <p className='mt-1 text-app-caption text-slate-300'>Spent on packages: {spentText} THB</p>
          <div className='mt-3 grid grid-cols-2 gap-2'>
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption' onClick={handleTopupCreate}>
              <BanknoteArrowUp className='mr-1 h-4 w-4' />
              {t('packages.topupAction')}
            </Button>
            <Button type='button' variant='secondary' className='h-10 w-full rounded-xl text-app-caption' onClick={() => router.push('/our-packages')}>
              <CreditCard className='mr-1 h-4 w-4' />
              {t('packages.payAction')}
            </Button>
          </div>
        </div>
      </article>

      {topupOrder ? (
        <section className='space-y-3 rounded-[22px] border border-cyan-300/50 bg-[linear-gradient(150deg,rgba(18,43,116,0.95),rgba(9,21,70,0.98))] p-4'>
          <div>
            <h2 className='text-app-h4 font-semibold text-slate-100'>{isThai ? 'Top up via PromptPay QR' : 'Top up via PromptPay QR'}</h2>
            <p className='mt-1 text-app-caption text-slate-200'>
              {isThai ? 'Transfer exactly the locked amount and verify slip.' : 'Transfer exactly the locked amount and verify slip.'}
            </p>
          </div>

          <div className='grid grid-cols-2 gap-2 text-app-caption text-slate-100'>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{isThai ? 'Amount' : 'Amount'}</p>
              <p className='font-semibold'>
                {t('packages.baht')} {topupOrder.uniqueAmountThb.toLocaleString(isThai ? 'th-TH' : 'en-US')}
              </p>
            </div>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{isThai ? 'Expires' : 'Expires'}</p>
              <p className='font-semibold'>{new Date(topupOrder.expiresAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
            </div>
          </div>

          <Image
            src={topupOrder.promptpayQrUrl}
            alt='PromptPay Topup QR'
            width={192}
            height={192}
            unoptimized
            className='mx-auto h-48 w-48 rounded-xl bg-white p-2'
          />

          <div className='space-y-2 rounded-xl border border-[rgba(155,188,255,0.26)] bg-[rgba(11,22,56,0.65)] p-3'>
            <h3 className='text-app-caption font-semibold text-slate-100'>
              <QrCode className='mr-1 inline h-4 w-4' />
              {isThai ? 'Submit top-up slip' : 'Submit top-up slip'}
            </h3>
            <Input value={slipReference} onChange={(event) => setSlipReference(event.target.value)} placeholder={isThai ? 'Reference' : 'Reference'} />
            <Input value={slipAmount} onChange={(event) => setSlipAmount(event.target.value)} placeholder={isThai ? 'Amount (THB)' : 'Amount (THB)'} inputMode='decimal' />
            <Input value={slipReceiver} onChange={(event) => setSlipReceiver(event.target.value)} placeholder={isThai ? 'Receiver account' : 'Receiver account'} />
            <Input value={slipPayer} onChange={(event) => setSlipPayer(event.target.value)} placeholder={isThai ? 'Payer account' : 'Payer account'} />
            <Input value={slipPayerName} onChange={(event) => setSlipPayerName(event.target.value)} placeholder={isThai ? 'Payer name' : 'Payer name'} />
            <Input value={slipTransferredAt} onChange={(event) => setSlipTransferredAt(event.target.value)} placeholder={isThai ? 'Transfer time' : 'Transfer time'} type='datetime-local' />
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
            <Input value={slipImageUrl} onChange={(event) => setSlipImageUrl(event.target.value)} placeholder={isThai ? 'Slip image URL' : 'Slip image URL'} />
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption' disabled={verifyingSlip || uploadingSlipImage} onClick={submitTopupSlipVerification}>
              {verifyingSlip ? (isThai ? 'Verifying slip...' : 'Verifying slip...') : isThai ? 'Verify top-up slip' : 'Verify top-up slip'}
            </Button>
            <Button type='button' variant='secondary' className='h-10 w-full rounded-xl text-app-caption' onClick={() => setTopupOrder(null)}>
              {isThai ? 'Cancel' : 'Cancel'}
            </Button>
          </div>
        </section>
      ) : null}

      <section className='neon-soft-panel rounded-[20px] p-3'>
        <h2 className='text-app-body font-semibold text-slate-100'>{t('packages.historyTitle')}</h2>
        <div className='mt-2 space-y-2'>
          {(loading ? [] : wallet.transactions).map((item) => {
            const incoming = item.direction === 'in';
            return (
              <article key={item.id} className='rounded-2xl border border-[rgba(146,186,255,0.28)] bg-[rgba(17,33,84,0.68)] px-3 py-2.5'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='line-clamp-1 text-app-caption font-semibold text-slate-100'>{item.label}</p>
                    <p className='mt-0.5 text-app-micro text-slate-300'>
                      {new Date(item.paidAt || item.createdAt).toLocaleString(isThai ? 'th-TH' : 'en-US')} • {translateStatus(item.status)}
                    </p>
                  </div>
                  <p className={'inline-flex items-center gap-1 text-app-caption font-semibold ' + (incoming ? 'text-emerald-200' : 'text-rose-200')}>
                    {incoming ? <ArrowDownCircle className='h-3.5 w-3.5' /> : <ArrowUpCircle className='h-3.5 w-3.5' />}
                    {(incoming ? '+' : '-') + t('packages.baht') + ' ' + Math.abs(item.amountThb).toLocaleString(isThai ? 'th-TH' : 'en-US')}
                  </p>
                </div>
              </article>
            );
          })}
          {loading ? <p className='text-app-caption text-slate-300'>{t('common.loading')}</p> : null}
          {!loading && wallet.transactions.length === 0 ? <p className='text-app-caption text-slate-300'>No wallet transactions yet.</p> : null}
        </div>
        <p className='mt-2 text-app-micro text-slate-300'>
          <CircleDollarSign className='mr-1 inline h-3.5 w-3.5 align-[-1px]' />
          Wallet supports QR top-up and package payment.
        </p>
      </section>
    </section>
  );
}
