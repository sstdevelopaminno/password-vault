'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, BanknoteArrowUp, CircleDollarSign, CreditCard, QrCode } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  extractSlipFieldsFromImageClient,
  hasMeaningfulSlipFields,
  optimizeSlipImageForUpload,
  toDatetimeLocalValue,
  toIsoFromDatetimeLocal,
  type SlipExtractedFields,
} from '@/lib/slip-autofill';

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

type SlipVerifyResponse = {
  error?: string;
  verified?: boolean;
  reason?: string[];
  balanceThb?: number;
  extracted?: SlipExtractedFields;
};

function defaultPayload(): WalletPayload {
  return {
    balanceThb: 0,
    spentThb: 0,
    transactions: [],
  };
}

function translateStatus(status: WalletTransaction['status'], isThai: boolean) {
  if (status === 'paid') return isThai ? 'สำเร็จ' : 'Paid';
  if (status === 'expired') return isThai ? 'หมดเวลา' : 'Expired';
  if (status === 'rejected') return isThai ? 'ไม่ผ่าน' : 'Rejected';
  return isThai ? 'รอตรวจสอบ' : 'Pending';
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
  const [slipFieldsLocked, setSlipFieldsLocked] = useState(false);
  const [scanningSlipOcr, setScanningSlipOcr] = useState(false);
  const [slipOcrProgress, setSlipOcrProgress] = useState(0);

  const loadWalletPayload = useCallback(async () => {
    const response = await fetch('/api/packages/wallet', { cache: 'no-store' });
    const payload = (await response.json().catch(() => ({}))) as Partial<WalletPayload> & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || (isThai ? 'โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ' : 'Failed to load wallet'));
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
        setErrorMessage(String(error instanceof Error ? error.message : isThai ? 'โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ' : 'Failed to load wallet'));
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

  const applyExtractedSlipFields = useCallback((extracted?: SlipExtractedFields | null) => {
    if (!extracted) return;

    if (typeof extracted.reference === 'string') setSlipReference(extracted.reference);
    if (typeof extracted.amountThb === 'number' && Number.isFinite(extracted.amountThb)) setSlipAmount(String(extracted.amountThb));
    if (typeof extracted.receiverAccount === 'string') setSlipReceiver(extracted.receiverAccount);
    if (typeof extracted.payerAccount === 'string') setSlipPayer(extracted.payerAccount);
    if (typeof extracted.payerName === 'string') setSlipPayerName(extracted.payerName);
    if (typeof extracted.transferredAt === 'string') setSlipTransferredAt(toDatetimeLocalValue(extracted.transferredAt));
    if (typeof extracted.slipImageUrl === 'string' && extracted.slipImageUrl) setSlipImageUrl(extracted.slipImageUrl);
    setSlipFieldsLocked(true);
  }, []);

  async function handleTopupCreate() {
    const input = window.prompt(isThai ? 'จำนวนเงินที่ต้องการเติม (บาท)' : 'Top-up amount (THB)', '500');
    if (!input) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage(isThai ? 'จำนวนเงินไม่ถูกต้อง' : 'Invalid top-up amount');
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
      setSlipReference('');
      setSlipAmount(String(payload.order.uniqueAmountThb));
      setSlipReceiver('');
      setSlipPayer('');
      setSlipPayerName('');
      setSlipTransferredAt('');
      setSlipImageUrl('');
      setSlipImageName('');
      setSlipFieldsLocked(false);
      setStatusMessage(isThai ? 'สร้างออเดอร์เติมเงินแล้ว สแกน QR และอัปโหลดสลิปเพื่อยืนยันอัตโนมัติ' : 'Top-up order created. Scan QR and upload slip for automatic verification.');
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Top-up order failed'));
    }
  }

  async function submitTopupSlipVerification(options?: { overrideSlipImageUrl?: string; autoRun?: boolean }) {
    if (!topupOrder) return;

    setVerifyingSlip(true);
    setErrorMessage('');
    setStatusMessage(options?.autoRun ? (isThai ? 'กำลังสแกนและตรวจสอบสลิปอัตโนมัติ...' : 'Scanning and verifying slip automatically...') : '');

    const slipImageForVerify = options?.overrideSlipImageUrl ?? slipImageUrl;
    const transferredAtIso = toIsoFromDatetimeLocal(slipTransferredAt);

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
          transferredAt: transferredAtIso,
          slipImageUrl: slipImageForVerify || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as SlipVerifyResponse;
      if (!response.ok) {
        throw new Error(String(payload.error ?? 'Top-up slip verification failed'));
      }

      applyExtractedSlipFields(payload.extracted ?? null);

      if (!payload.verified) {
        throw new Error(`Slip verification failed: ${(payload.reason ?? []).join(',')}`);
      }

      setStatusMessage(isThai ? 'เติมเงินสำเร็จ กระเป๋าเงินอัปเดตแล้ว' : 'Top-up succeeded. Wallet updated.');
      setTopupOrder(null);
      setSlipReference('');
      setSlipAmount('');
      setSlipReceiver('');
      setSlipPayer('');
      setSlipPayerName('');
      setSlipTransferredAt('');
      setSlipImageUrl('');
      setSlipImageName('');
      setSlipFieldsLocked(false);
      if (typeof payload.balanceThb === 'number' && Number.isFinite(payload.balanceThb)) {
        const nextBalance = Number(payload.balanceThb);
        setWallet((prev) => ({ ...prev, balanceThb: nextBalance }));
      }
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
    setScanningSlipOcr(true);
    setSlipOcrProgress(0);
    setErrorMessage('');
    setStatusMessage(isThai ? 'กำลังสแกนข้อมูลจากรูปสลิป...' : 'Scanning slip details from image...');

    try {
      let lockedByClientOcr = false;
      try {
        const ocr = await extractSlipFieldsFromImageClient({
          file,
          expectedAmountThb: topupOrder?.uniqueAmountThb ?? null,
          onProgress: (value) => setSlipOcrProgress(value),
        });
        if (hasMeaningfulSlipFields(ocr.extracted)) {
          applyExtractedSlipFields(ocr.extracted);
          lockedByClientOcr = true;
        }
      } catch {
        // Keep flow running even when local OCR cannot extract fields.
      } finally {
        setSlipOcrProgress(1);
        setScanningSlipOcr(false);
      }

      setStatusMessage(isThai ? 'กำลังเตรียมและอัปโหลดสลิป...' : 'Preparing and uploading slip image...');
      const optimizedFile = await optimizeSlipImageForUpload(file);
      const formData = new FormData();
      formData.append('file', optimizedFile, optimizedFile.name);
      const response = await fetch('/api/packages/slip/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; slipImageUrl?: string };
      if (!response.ok || !payload.slipImageUrl) {
        throw new Error(String(payload.error ?? 'Slip image upload failed'));
      }
      setSlipImageUrl(payload.slipImageUrl);
      setSlipImageName(optimizedFile.name || file.name || 'slip-image');
      setSlipFieldsLocked(lockedByClientOcr);
      await submitTopupSlipVerification({
        overrideSlipImageUrl: payload.slipImageUrl,
        autoRun: true,
      });
    } catch (error) {
      setErrorMessage(String(error instanceof Error ? error.message : 'Slip image upload failed'));
    } finally {
      setScanningSlipOcr(false);
      setUploadingSlipImage(false);
    }
  }

  const slipInputsDisabled = verifyingSlip || uploadingSlipImage || slipFieldsLocked;
  const slipProgressPercent = scanningSlipOcr
    ? Math.max(1, Math.min(95, Math.round(slipOcrProgress * 100)))
    : uploadingSlipImage
      ? 96
      : verifyingSlip
        ? 99
        : 0;

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
          <p className='mt-1 text-app-caption text-slate-300'>{isThai ? `ใช้ไปกับแพ็กเกจ: ${spentText} บาท` : `Spent on packages: ${spentText} THB`}</p>
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
            <h2 className='text-app-h4 font-semibold text-slate-100'>{isThai ? 'เติมเงินด้วย PromptPay QR' : 'Top up via PromptPay QR'}</h2>
            <p className='mt-1 text-app-caption text-slate-200'>
              {isThai ? 'โอนตามยอดที่ล็อกไว้เท่านั้น แล้วอัปโหลดสลิปเพื่อให้ระบบตรวจสอบอัตโนมัติ' : 'Transfer exactly the locked amount, then upload slip for automatic verification.'}
            </p>
          </div>

          <div className='grid grid-cols-2 gap-2 text-app-caption text-slate-100'>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{isThai ? 'ยอดที่ต้องโอน' : 'Amount'}</p>
              <p className='font-semibold'>
                {t('packages.baht')} {topupOrder.uniqueAmountThb.toLocaleString(isThai ? 'th-TH' : 'en-US')}
              </p>
            </div>
            <div className='rounded-xl bg-[rgba(12,23,60,0.65)] p-2'>
              <p className='text-app-micro text-slate-300'>{isThai ? 'หมดเวลา' : 'Expires'}</p>
              <p className='font-semibold'>{new Date(topupOrder.expiresAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
            </div>
          </div>

          <Image
            src={topupOrder.promptpayQrUrl}
            alt='PromptPay topup QR'
            width={192}
            height={192}
            unoptimized
            className='mx-auto h-48 w-48 rounded-xl bg-white p-2'
          />

          <div className='space-y-2 rounded-xl border border-[rgba(155,188,255,0.26)] bg-[rgba(11,22,56,0.65)] p-3'>
            <h3 className='text-app-caption font-semibold text-slate-100'>
              <QrCode className='mr-1 inline h-4 w-4' />
              {isThai ? 'ยืนยันสลิปเติมเงิน' : 'Submit top-up slip'}
            </h3>
            <p className='text-app-micro text-slate-300'>
              {isThai ? 'อัปโหลดสลิปแล้วระบบจะสแกน กรอกข้อมูล และตรวจสอบให้อัตโนมัติ' : 'Upload slip and the system will scan, auto-fill, and verify automatically.'}
            </p>
            {(scanningSlipOcr || uploadingSlipImage || verifyingSlip) ? (
              <div className='rounded-xl border border-cyan-300/30 bg-[rgba(9,22,62,0.72)] px-3 py-2'>
                <div className='mb-1 flex items-center justify-between text-app-micro text-slate-200'>
                  <span>{isThai ? 'ความคืบหน้า' : 'Progress'}</span>
                  <span>{slipProgressPercent}%</span>
                </div>
                <div className='h-2 overflow-hidden rounded-full bg-[rgba(154,195,255,0.2)]'>
                  <div className='h-full rounded-full bg-[linear-gradient(90deg,#21d4fd,#5b8cff)] transition-all duration-300' style={{ width: `${slipProgressPercent}%` }} />
                </div>
              </div>
            ) : null}
            <Input value={slipReference} onChange={(event) => setSlipReference(event.target.value)} placeholder={isThai ? 'เลขอ้างอิง (ถ้ามี)' : 'Reference'} disabled={slipInputsDisabled} />
            <Input value={slipAmount} onChange={(event) => setSlipAmount(event.target.value)} placeholder={isThai ? 'ยอดที่โอน (บาท)' : 'Amount (THB)'} inputMode='decimal' disabled={slipInputsDisabled} />
            <Input value={slipReceiver} onChange={(event) => setSlipReceiver(event.target.value)} placeholder={isThai ? 'เลขบัญชีผู้รับ (ถ้ามี)' : 'Receiver account'} disabled={slipInputsDisabled} />
            <Input value={slipPayer} onChange={(event) => setSlipPayer(event.target.value)} placeholder={isThai ? 'เลขบัญชีผู้โอน (ถ้ามี)' : 'Payer account'} disabled={slipInputsDisabled} />
            <Input value={slipPayerName} onChange={(event) => setSlipPayerName(event.target.value)} placeholder={isThai ? 'ชื่อผู้โอน (ถ้ามี)' : 'Payer name'} disabled={slipInputsDisabled} />
            <Input value={slipTransferredAt} onChange={(event) => setSlipTransferredAt(event.target.value)} placeholder={isThai ? 'เวลาที่โอน' : 'Transfer time'} type='datetime-local' disabled={slipInputsDisabled} />
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
            <Input value={slipImageUrl} readOnly disabled placeholder={isThai ? 'ลิงก์รูปสลิป' : 'Slip image URL'} />
            <Button type='button' className='h-10 w-full rounded-xl text-app-caption' disabled={verifyingSlip || uploadingSlipImage} onClick={() => void submitTopupSlipVerification()}>
              {verifyingSlip ? (isThai ? 'กำลังตรวจสอบสลิป...' : 'Verifying slip...') : isThai ? 'ตรวจสอบสลิปอีกครั้ง' : 'Verify again'}
            </Button>
            <Button
              type='button'
              variant='secondary'
              className='h-10 w-full rounded-xl text-app-caption'
              onClick={() => {
                setTopupOrder(null);
                setSlipFieldsLocked(false);
              }}
            >
              {isThai ? 'ยกเลิก' : 'Cancel'}
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
                      {new Date(item.paidAt || item.createdAt).toLocaleString(isThai ? 'th-TH' : 'en-US')} • {translateStatus(item.status, isThai)}
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
          {!loading && wallet.transactions.length === 0 ? <p className='text-app-caption text-slate-300'>{isThai ? 'ยังไม่มีรายการกระเป๋าเงิน' : 'No wallet transactions yet.'}</p> : null}
        </div>
        <p className='mt-2 text-app-micro text-slate-300'>
          <CircleDollarSign className='mr-1 inline h-3.5 w-3.5 align-[-1px]' />
          {isThai ? 'รองรับการเติมเงินผ่าน QR และนำยอดไปชำระแพ็กเกจได้ทันที' : 'Supports QR top-up and package payments.'}
        </p>
      </section>
    </section>
  );
}
