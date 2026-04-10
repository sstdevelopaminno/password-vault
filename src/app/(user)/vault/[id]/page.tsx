'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Copy, Eye, KeyRound, Link as LinkIcon, Type, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PinModal } from '@/components/vault/pin-modal';
import { useHeadsUpNotifications } from '@/components/notifications/heads-up-provider';
import { useToast } from '@/components/ui/toast';
import type { PinAction } from '@/lib/pin';
import { useI18n } from '@/i18n/provider';

type VaultItemDetail = {
  id: string;
  title: string;
  username: string;
  url?: string | null;
  secretMasked: string;
};

type RowKey = 'title' | 'username' | 'password' | 'url' | 'main_copy';

type PendingAction = {
  action: PinAction;
  label: string;
  mode: 'view_secret' | 'copy_secret' | 'copy_field' | 'copy_all';
  copyValue?: string;
  copySuccessText?: string;
  copyKey?: RowKey;
};

type AssertionCacheEntry = {
  token: string;
  expiresAt: number;
};

const ASSERTION_TTL_MS = 25_000;

export default function VaultDetailPage() {
  const params = useParams<{ id: string }>();
  const { notify } = useHeadsUpNotifications();
  const { showToast } = useToast();
  const { t, locale } = useI18n();
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assertionCacheRef = useRef<Partial<Record<PinAction, AssertionCacheEntry>>>({});

  const itemId = useMemo(() => {
    if (Array.isArray(params.id)) return decodeURIComponent(params.id[0] ?? '');
    return decodeURIComponent(params.id ?? '');
  }, [params.id]);

  const [item, setItem] = useState<VaultItemDetail | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [status, setStatus] = useState('');
  const [notFoundPopupOpen, setNotFoundPopupOpen] = useState(false);
  const [copiedRow, setCopiedRow] = useState<RowKey | null>(null);

  const text = useMemo(
    () => ({
      copyTitle: locale === 'th' ? 'คัดลอกชื่อรายการ' : 'Copy title',
      copyUsername: locale === 'th' ? 'คัดลอกชื่อผู้ใช้' : 'Copy username',
      copyUrl: locale === 'th' ? 'คัดลอกลิงก์' : 'Copy link',
      copyAll: locale === 'th' ? 'คัดลอกทั้งหมด' : 'Copy all',
      actionCopyAll: locale === 'th' ? 'คัดลอกข้อมูลทั้งหมด' : 'Copy all details',
      copiedTitle: locale === 'th' ? 'คัดลอกชื่อรายการสำเร็จแล้ว' : 'Title copied',
      copiedUsername: locale === 'th' ? 'คัดลอกชื่อผู้ใช้สำเร็จแล้ว' : 'Username copied',
      copiedUrl: locale === 'th' ? 'คัดลอกลิงก์สำเร็จแล้ว' : 'Link copied',
      copiedPassword: locale === 'th' ? 'คัดลอกรหัสผ่านสำเร็จแล้ว' : 'Password copied',
      copiedAll: locale === 'th' ? 'คัดลอกข้อมูลทั้งหมดสำเร็จแล้ว' : 'All details copied',
      copiedDone: locale === 'th' ? 'คัดลอกแล้ว' : 'Copied',
      copyFailed: locale === 'th' ? 'คัดลอกไม่สำเร็จ กรุณาลองใหม่' : 'Copy failed. Please try again.',
      titleLabel: locale === 'th' ? 'ชื่อรายการ' : 'Title',
      usernameLabel: locale === 'th' ? 'ชื่อผู้ใช้' : 'Username',
      passwordLabel: locale === 'th' ? 'รหัสผ่าน' : 'Password',
      urlLabel: 'URL',
    }),
    [locale],
  );

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const getCachedAssertion = useCallback((action: PinAction) => {
    const cached = assertionCacheRef.current[action];
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      delete assertionCacheRef.current[action];
      return null;
    }
    return cached.token;
  }, []);

  const setCachedAssertion = useCallback((action: PinAction, token: string) => {
    assertionCacheRef.current[action] = {
      token,
      expiresAt: Date.now() + ASSERTION_TTL_MS,
    };
  }, []);

  const clearCachedAssertion = useCallback((action: PinAction) => {
    delete assertionCacheRef.current[action];
  }, []);

  const isNotFoundError = useCallback((value: unknown) => {
    const textValue = String(value ?? '').toLowerCase();
    return textValue.includes('not found') || textValue.includes('item not found');
  }, []);

  const showNotFoundPopup = useCallback(() => {
    setNotFoundPopupOpen(true);
  }, []);

  const load = useCallback(async () => {
    if (itemId === '') return;
    const res = await fetch('/api/vault/' + itemId, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(t('vaultDetail.loadFailed'));
      const message = (body as any).error ?? t('vaultDetail.loadFailed');
      showToast(message, 'error');
      if (isNotFoundError(message)) {
        showNotFoundPopup();
      }
      return;
    }
    setItem(body as VaultItemDetail);
  }, [itemId, isNotFoundError, showNotFoundPopup, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const markCopied = useCallback((rowKey: RowKey) => {
    setCopiedRow(rowKey);
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = setTimeout(() => {
      setCopiedRow((prev) => (prev === rowKey ? null : prev));
    }, 2000);
  }, []);

  const writeClipboardWithFallback = useCallback(async (value: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // fallback below
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const copyToClipboard = useCallback(
    async (value: string, successText: string, rowKey: RowKey) => {
      const ok = await writeClipboardWithFallback(value);
      if (ok) {
        setStatus(successText);
        markCopied(rowKey);
        showToast(successText, 'success');
        notify({
          kind: 'vault',
          title: locale === 'th' ? 'มีการคัดลอกข้อมูลลับ' : 'Sensitive data copied',
          message: successText,
          details:
            locale === 'th'
              ? 'หากไม่ใช่การกระทำของคุณ กรุณาเปลี่ยนรหัสผ่านและตรวจสอบ audit logs'
              : 'If this was not you, change password and review audit logs.',
          href: '/vault/' + itemId,
          alsoSystem: true,
        });
        return;
      }

      setStatus(text.copyFailed);
      showToast(text.copyFailed, 'error');
    },
    [itemId, locale, markCopied, notify, showToast, text.copyFailed, writeClipboardWithFallback],
  );

  const buildAllCopyPayload = (secret: string) => {
    const lines = [
      `${text.titleLabel}: ${item?.title ?? '-'}`,
      `${text.usernameLabel}: ${item?.username ?? '-'}`,
      `${text.passwordLabel}: ${secret}`,
    ];
    if (item?.url) {
      lines.push(`${text.urlLabel}: ${item.url}`);
    }
    return lines.join('\n');
  };

  const executeSecureAction = useCallback(
    async (actionData: PendingAction, assertionToken: string) => {
      if (actionData.mode === 'copy_field') {
        const value = String(actionData.copyValue ?? '');
        if (value === '') {
          setStatus(text.copyFailed);
          showToast(text.copyFailed, 'error');
          return;
        }
        await copyToClipboard(value, actionData.copySuccessText ?? t('vaultDetail.copiedToast'), actionData.copyKey ?? 'main_copy');
        return;
      }

      const res = await fetch('/api/vault/' + itemId + '/secret?action=' + actionData.action, {
        headers: { 'x-pin-assertion': assertionToken },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || (body as any).secret == null) {
        const message = (body as any).error ?? t('vaultDetail.actionFailed');
        setStatus(message);
        showToast(message, 'error');
        clearCachedAssertion(actionData.action);
        if (isNotFoundError(message)) {
          showNotFoundPopup();
        }
        return;
      }

      const secret = String((body as any).secret ?? '');
      if (actionData.mode === 'copy_secret') {
        await copyToClipboard(secret, text.copiedPassword, actionData.copyKey ?? 'password');
      } else if (actionData.mode === 'copy_all') {
        await copyToClipboard(buildAllCopyPayload(secret), text.copiedAll, actionData.copyKey ?? 'main_copy');
      } else {
        setRevealedSecret(secret);
        setStatus(t('vaultDetail.revealed'));
      }
    },
    [buildAllCopyPayload, clearCachedAssertion, copyToClipboard, isNotFoundError, itemId, showNotFoundPopup, showToast, t, text.copiedAll, text.copiedPassword, text.copyFailed],
  );

  const runWithPin = useCallback(
    async (actionData: PendingAction) => {
      setCopiedRow(null);
      const cachedToken = getCachedAssertion(actionData.action);
      if (cachedToken) {
        await executeSecureAction(actionData, cachedToken);
        return;
      }
      setPendingAction(actionData);
    },
    [executeSecureAction, getCachedAssertion],
  );

  const onPinVerified = useCallback(
    async (assertionToken: string, actionData: PendingAction) => {
      setCachedAssertion(actionData.action, assertionToken);
      await executeSecureAction(actionData, assertionToken);
    },
    [executeSecureAction, setCachedAssertion],
  );

  const busy = pendingAction !== null;

  const CopyLabel = ({ row }: { row: RowKey }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs ${copiedRow === row ? 'text-emerald-700' : ''}`}>
      {copiedRow === row ? <CheckCircle2 className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
      {copiedRow === row ? text.copiedDone : t('vaultDetail.copy')}
    </span>
  );

  return (
    <section className='space-y-4 pb-20'>
      <Card className='space-y-4 animate-slide-up'>
        <h1 className='text-lg font-semibold'>{item?.title ?? t('vaultDetail.fallbackTitle')}</h1>

        <div className='space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3'>
          <div className='flex items-center justify-between gap-2'>
            <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
              <Type className='h-4 w-4 text-slate-500' />
              {t('addItem.fieldTitle')}: {item?.title ?? '-'}
            </p>
            <Button
              size='sm'
              variant='secondary'
              className={`h-8 rounded-lg px-2.5 transition ${copiedRow === 'title' ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
              disabled={busy}
              onClick={() => {
                void runWithPin({
                  action: 'copy_secret',
                  label: text.copyTitle,
                  mode: 'copy_field',
                  copyValue: String(item?.title ?? ''),
                  copySuccessText: text.copiedTitle,
                  copyKey: 'title',
                });
              }}
            >
              <CopyLabel row='title' />
            </Button>
          </div>

          <div className='flex items-center justify-between gap-2'>
            <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
              <UserRound className='h-4 w-4 text-slate-500' />
              {t('vaultDetail.usernameLabel')}: {item?.username ?? '-'}
            </p>
            <Button
              size='sm'
              variant='secondary'
              className={`h-8 rounded-lg px-2.5 transition ${copiedRow === 'username' ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
              disabled={busy}
              onClick={() => {
                void runWithPin({
                  action: 'copy_secret',
                  label: text.copyUsername,
                  mode: 'copy_field',
                  copyValue: String(item?.username ?? ''),
                  copySuccessText: text.copiedUsername,
                  copyKey: 'username',
                });
              }}
            >
              <CopyLabel row='username' />
            </Button>
          </div>

          <div className='flex items-center justify-between gap-2'>
            <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
              <KeyRound className='h-4 w-4 text-slate-500' />
              {t('vaultDetail.passwordLabel')}: <span className='font-semibold'>{revealedSecret ?? item?.secretMasked ?? t('vaultDetail.masked')}</span>
            </p>
            <Button
              size='sm'
              variant='secondary'
              className={`h-8 rounded-lg px-2.5 transition ${copiedRow === 'password' ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
              disabled={busy}
              onClick={() => {
                void runWithPin({
                  action: 'copy_secret',
                  label: t('vaultDetail.actionCopy'),
                  mode: 'copy_secret',
                  copyKey: 'password',
                });
              }}
            >
              <CopyLabel row='password' />
            </Button>
          </div>

          {item?.url ? (
            <div className='flex items-center justify-between gap-2'>
              <p className='inline-flex items-center gap-2 text-sm text-slate-700'>
                <LinkIcon className='h-4 w-4 text-slate-500' />
                URL: {item.url}
              </p>
              <Button
                size='sm'
                variant='secondary'
                className={`h-8 rounded-lg px-2.5 transition ${copiedRow === 'url' ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
                disabled={busy}
                onClick={() => {
                  void runWithPin({
                    action: 'copy_secret',
                    label: text.copyUrl,
                    mode: 'copy_field',
                    copyValue: String(item.url ?? ''),
                    copySuccessText: text.copiedUrl,
                    copyKey: 'url',
                  });
                }}
              >
                <CopyLabel row='url' />
              </Button>
            </div>
          ) : null}
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <Button
            variant='secondary'
            className='h-11 rounded-xl'
            disabled={busy}
            onClick={() => {
              void runWithPin({
                action: 'view_secret',
                label: t('vaultDetail.actionView'),
                mode: 'view_secret',
              });
            }}
          >
            <span className='inline-flex items-center gap-2'>
              <Eye className='h-4 w-4' />
              {t('vaultDetail.reveal')}
            </span>
          </Button>
          <Button
            variant='secondary'
            className={`h-11 rounded-xl transition ${copiedRow === 'main_copy' ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
            disabled={busy}
            onClick={() => {
              void runWithPin({
                action: 'copy_secret',
                label: text.actionCopyAll,
                mode: 'copy_all',
                copyKey: 'main_copy',
              });
            }}
          >
            <span className={`inline-flex items-center gap-2 ${copiedRow === 'main_copy' ? 'text-emerald-700' : ''}`}>
              {copiedRow === 'main_copy' ? <CheckCircle2 className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
              {copiedRow === 'main_copy' ? text.copiedDone : text.copyAll}
            </span>
          </Button>
        </div>

        {status ? <p className='text-xs text-slate-600'>{status}</p> : null}
      </Card>

      {pendingAction ? (
        <PinModal
          action={pendingAction.action}
          actionLabel={pendingAction.label}
          targetItemId={itemId}
          onVerified={(assertionToken) => void onPinVerified(assertionToken, pendingAction)}
          onClose={() => setPendingAction(null)}
        />
      ) : null}

      {notFoundPopupOpen ? (
        <div className='fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]'>
          <Card className='w-full max-w-sm space-y-4 rounded-3xl border border-slate-200 p-5 shadow-2xl'>
            <div className='space-y-1'>
              <h3 className='text-base font-semibold text-slate-900'>{t('vaultDetail.notFound')}</h3>
              <p className='text-sm text-slate-500'>{t('vaultDetail.loadFailed')}</p>
            </div>
            <Button className='w-full bg-gradient-to-r from-blue-600 to-indigo-500 text-white' onClick={() => setNotFoundPopupOpen(false)}>
              {t('addItem.closeAria')}
            </Button>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

