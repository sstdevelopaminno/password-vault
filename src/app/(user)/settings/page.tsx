'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Languages,
  LifeBuoy,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Moon,
  Printer,
  QrCode,
  Smartphone,
  Trash2,
  Sun,
  SunMoon,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { OtpInput } from '@/components/auth/otp-input';
import { TopQuickActions } from '@/components/layout/top-quick-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { PinModal } from '@/components/vault/pin-modal';
import { useI18n } from '@/i18n/provider';
import { isAdminFeaturesEnabledClient } from '@/lib/admin-feature-flags';
import { useDisplayScale, type DisplayScaleMode } from '@/lib/display-scale';
import { useTheme, type ThemeMode } from '@/lib/theme';

type SettingsSection = '' | 'name' | 'email' | 'password' | 'pin' | 'language' | 'theme' | 'display' | 'logout';

const SETTINGS_SECTION_QUERY = 'section';

function parseSettingsSection(raw: string | null): SettingsSection {
  if (raw === 'name' || raw === 'email' || raw === 'password' || raw === 'pin' || raw === 'language' || raw === 'theme' || raw === 'display' || raw === 'logout') {
    return raw;
  }
  return '';
}

function normalizeSpaces(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function mapError<T extends string>(message: unknown, t: (key: T) => string, locale: 'th' | 'en') {
  const text = String(message ?? '').toLowerCase();
  if (text.includes('token') || text.includes('invalid otp')) return t('verifyOtp.invalid' as T);
  if (text.includes('pin verification required') || text.includes('invalid pin assertion')) {
    return locale === 'th' ? 'เธเธฒเธฃเธขเธทเธเธขเธฑเธ PIN เธซเธกเธ”เธญเธฒเธขเธธ เธเธฃเธธเธ“เธฒเธขเธทเธเธขเธฑเธ PIN เนเธซเธกเนเธญเธตเธเธเธฃเธฑเนเธ' : 'PIN verification expired. Please verify PIN again.';
  }
  if (text.includes('rate limit')) {
    return locale === 'th' ? 'เธเธญ OTP เธ–เธตเนเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน' : 'OTP is rate limited. Please wait.';
  }
  return String(message ?? t('settings.updateFailed' as T));
}

export default function SettingsPage() {
  const toast = useToast();
  const { t, locale, setLocale } = useI18n();
  const { mode: displayScaleMode, setMode: setDisplayScaleMode } = useDisplayScale();
  const { mode: themeMode, resolvedTheme, setMode: setThemeMode } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminFeaturesEnabled = isAdminFeaturesEnabledClient();

  const active = useMemo(
    () => parseSettingsSection(searchParams.get(SETTINGS_SECTION_QUERY)),
    [searchParams],
  );

  const openSection = useCallback(
    (section: Exclude<SettingsSection, ''>) => {
      router.push('/settings?' + SETTINGS_SECTION_QUERY + '=' + section);
    },
    [router],
  );

  const goMenuRoot = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const [loading, setLoading] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailAutoLoading, setEmailAutoLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileUserId, setProfileUserId] = useState('');
  const [profileRole, setProfileRole] = useState('pending');
  const [profileStatus, setProfileStatus] = useState('pending_approval');

  const [emailStep, setEmailStep] = useState<'enter_email' | 'enter_otp'>('enter_email');
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [showUseLatestOtp, setShowUseLatestOtp] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [hasExistingPin, setHasExistingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3 | 4>(1);
  const [deletePinModalOpen, setDeletePinModalOpen] = useState(false);
  const [deletePinAssertionToken, setDeletePinAssertionToken] = useState<string | null>(null);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteOtpSending, setDeleteOtpSending] = useState(false);
  const [deleteOtpCooldown, setDeleteOtpCooldown] = useState(0);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const deleteConfirmSuffix = 'เธขเธทเธเธขเธฑเธเธเธฒเธฃเธฅเธเธเนเธญเธกเธนเธฅเนเธฅเธฐเธเธฑเธเธเธตเธเธตเน เธญเธขเนเธฒเธเธ–เธฒเธงเธฃ';
  const deleteExpectedText = useMemo(
    () => `${String(fullName ?? '').trim()} ${deleteConfirmSuffix}`.trim(),
    [fullName],
  );

  const loadProfile = useCallback(async () => {
    const response = await fetch('/api/profile/me', { method: 'GET' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return;

    setFullName(String(body?.fullName ?? ''));
    setProfileEmail(String(body?.email ?? ''));
    setProfileUserId(String(body?.userId ?? ''));
    setProfileRole(String(body?.role ?? 'pending'));
    setProfileStatus(String(body?.status ?? 'pending_approval'));
    setHasExistingPin(Boolean(body?.hasPin));
  }, []);

  const apiCall = useCallback(
    async (url: string, method: 'POST' | 'PATCH', payload: unknown, fallback: string) => {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.showToast(mapError(body?.error ?? fallback, t, locale), 'error');
        return null;
      }
      return body;
    },
    [locale, t, toast],
  );

  const updateProfile = useCallback(async () => {
    const name = String(fullName).trim();
    if (name.length < 2) {
      toast.showToast(
        locale === 'th' ? 'เธเธทเนเธญเนเธเธฃเนเธเธฅเนเธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 2 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ' : 'Profile name is too short.',
        'error',
      );
      return;
    }

    setLoading(true);
    const body = await apiCall(
      '/api/profile/update',
      'PATCH',
      { purpose: 'change_profile', fullName: name },
      t('settings.updateFailed'),
    );
    setLoading(false);

    if (!body) return;
    toast.showToast(String(body?.message ?? t('settings.profileUpdated')), 'success');
    goMenuRoot();
    void loadProfile();
  }, [apiCall, fullName, goMenuRoot, loadProfile, locale, t, toast]);

  const sendEmailOtp = useCallback(async () => {
    const email = String(newEmail).trim().toLowerCase();
    if (!email.includes('@')) {
      toast.showToast(locale === 'th' ? 'เธญเธตเน€เธกเธฅเนเธกเนเธ–เธนเธเธ•เนเธญเธ' : 'Invalid email', 'error');
      return;
    }

    if (resendIn > 0) {
      toast.showToast(
        locale === 'th'
          ? 'เธเธฃเธธเธ“เธฒเธฃเธญเธเนเธญเธเธเธญ OTP เนเธซเธกเน เนเธฅเธฐเนเธเน OTP เธฅเนเธฒเธชเธธเธ”เนเธเธญเธตเน€เธกเธฅ'
          : 'Please wait before requesting new OTP and use your latest OTP.',
        'error',
      );
      setEmailStep('enter_otp');
      return;
    }

    setEmailLoading(true);
    const response = await fetch('/api/profile/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'change_email', email }),
    });
    const body = await response.json().catch(() => ({}));
    setEmailLoading(false);

    if (!response.ok) {
      toast.showToast(mapError(body?.error ?? t('settings.otpSendFailed'), t, locale), 'error');
      const rawError = String(body?.error ?? '').toLowerCase();
      const forceOtpStep =
        Boolean(body?.otpAlreadyRequested) ||
        response.status === 429 ||
        (rawError.includes('email address') && rawError.includes('is invalid'));
      if (forceOtpStep) {
        setEmailStep('enter_otp');
        setResendIn(Number(body?.retryAfterSec ?? 60));
        setShowUseLatestOtp(true);
      }
      return;
    }

    setEmailStep('enter_otp');
    setEmailOtp('');
    setResendIn(60);
    setShowUseLatestOtp(false);
    toast.showToast(String(body?.message ?? t('settings.otpSent')), 'success');
  }, [locale, newEmail, resendIn, t, toast]);

  const confirmEmailChange = useCallback(async () => {
    if (emailAutoLoading || emailOtp.length !== 6) return;

    setEmailAutoLoading(true);
    const body = await apiCall(
      '/api/profile/update',
      'PATCH',
      { purpose: 'change_email', newEmail: String(newEmail).trim().toLowerCase(), otp: emailOtp },
      t('settings.updateFailed'),
    );
    setEmailAutoLoading(false);

    if (!body) {
      setEmailOtp('');
      return;
    }

    toast.showToast(String(body?.message ?? t('settings.profileUpdated')), 'success');
    goMenuRoot();
    setEmailStep('enter_email');
    setEmailOtp('');
    setResendIn(0);
    setShowUseLatestOtp(false);
    void loadProfile();
  }, [apiCall, emailAutoLoading, emailOtp, goMenuRoot, loadProfile, newEmail, t, toast]);

  const updatePassword = useCallback(async () => {
    const nextPassword = String(newPassword ?? '');
    if (nextPassword.length < 8) {
      toast.showToast(
        locale === 'th'
          ? 'เธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเนเธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 8 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ'
          : 'Password must be at least 8 characters',
        'error',
      );
      return;
    }
    if (passwordSaving) return;

    setPasswordSaving(true);
    const body = await apiCall(
      '/api/profile/update',
      'PATCH',
      { purpose: 'change_password', newPassword: nextPassword },
      t('settings.updateFailed'),
    );
    setPasswordSaving(false);

    if (!body) return;

    toast.showToast(String(body?.message ?? t('settings.profileUpdated')), 'success');
    setNewPassword('');
    goMenuRoot();
  }, [apiCall, goMenuRoot, locale, newPassword, passwordSaving, t, toast]);

  const updatePin = useCallback(async () => {
    if (pinSaving) return;

    const nextPin = String(newPin ?? '').replace(/\D/g, '').slice(0, 6);
    const nextConfirm = String(confirmPin ?? '').replace(/\D/g, '').slice(0, 6);
    const current = String(currentPin ?? '').replace(/\D/g, '').slice(0, 6);

    if (nextPin.length !== 6 || nextConfirm.length !== 6) {
      toast.showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธ PIN เนเธซเธกเนเนเธฅเธฐเธขเธทเธเธขเธฑเธ PIN เนเธซเนเธเธฃเธ 6 เธซเธฅเธฑเธ' : 'Please enter new PIN and confirmation (6 digits).', 'error');
      return;
    }
    if (nextPin !== nextConfirm) {
      toast.showToast(locale === 'th' ? 'PIN เนเธซเธกเนเนเธฅเธฐเธขเธทเธเธขเธฑเธ PIN เนเธกเนเธ•เธฃเธเธเธฑเธ' : 'PIN confirmation does not match.', 'error');
      return;
    }
    if (hasExistingPin && current.length !== 6) {
      toast.showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธ PIN เธเธฑเธเธเธธเธเธฑเธ 6 เธซเธฅเธฑเธ' : 'Current PIN is required (6 digits).', 'error');
      return;
    }

    setPinSaving(true);
    const response = await fetch('/api/pin/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPin: hasExistingPin ? current : undefined,
        newPin: nextPin,
        confirmPin: nextConfirm,
      }),
    });
    const body = await response.json().catch(() => ({} as { error?: string; firstTime?: boolean }));
    setPinSaving(false);

    if (!response.ok) {
      toast.showToast(mapError(body?.error ?? (locale === 'th' ? 'เธญเธฑเธเน€เธ”เธ• PIN เนเธกเนเธชเธณเน€เธฃเนเธ' : 'Failed to update PIN'), t, locale), 'error');
      return;
    }

    toast.showToast(locale === 'th' ? 'เธเธฑเธเธ—เธถเธ PIN เธชเธณเน€เธฃเนเธ' : 'PIN updated successfully', 'success');
    setHasExistingPin(true);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinDialogOpen(false);
  }, [confirmPin, currentPin, hasExistingPin, locale, newPin, pinSaving, t, toast]);

  const openDeleteModal = useCallback(() => {
    if (!profileUserId) {
      toast.showToast(
        locale === 'th' ? 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธฃเธดเนเธกเธเธฑเนเธเธ•เธญเธเธฅเธเธเธฑเธเธเธตเนเธ”เน เธเธฃเธธเธ“เธฒเธฃเธตเน€เธเธฃเธเธซเธเนเธฒเธญเธตเธเธเธฃเธฑเนเธ' : 'Unable to start delete flow. Please refresh.',
        'error',
      );
      return;
    }
    setDeleteModalOpen(true);
    setDeleteStep(1);
    setDeletePinModalOpen(false);
    setDeletePinAssertionToken(null);
    setDeleteOtp('');
    setDeleteOtpCooldown(0);
    setDeleteConfirmationText('');
  }, [locale, profileUserId, toast]);

  const closeDeleteModal = useCallback(() => {
    if (deleteSubmitting) return;
    setDeleteModalOpen(false);
    setDeleteStep(1);
    setDeletePinModalOpen(false);
    setDeletePinAssertionToken(null);
    setDeleteOtp('');
    setDeleteOtpCooldown(0);
    setDeleteConfirmationText('');
  }, [deleteSubmitting]);

  const sendDeleteOtp = useCallback(async () => {
    if (deleteOtpCooldown > 0 || deleteOtpSending) return;
    setDeleteOtpSending(true);
    const response = await fetch('/api/profile/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'delete_account' }),
    });
    const body = await response.json().catch(() => ({}));
    setDeleteOtpSending(false);

    if (!response.ok) {
      toast.showToast(mapError(body?.error ?? 'OTP request failed', t, locale), 'error');
      if (response.status === 429) {
        setDeleteOtpCooldown(Number(body?.retryAfterSec ?? 60));
      }
      return;
    }

    setDeleteOtpCooldown(60);
    toast.showToast(
      locale === 'th' ? 'เธชเนเธ OTP เนเธเธ—เธตเนเธญเธตเน€เธกเธฅเธเธญเธเธเธธเธ“เนเธฅเนเธง' : 'OTP sent to your email.',
      'success',
    );
  }, [deleteOtpCooldown, deleteOtpSending, locale, t, toast]);

  const confirmDeleteAccount = useCallback(async () => {
    if (!deletePinAssertionToken || deleteSubmitting) return;
    setDeleteSubmitting(true);
    const response = await fetch('/api/profile/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pin-assertion': deletePinAssertionToken,
      },
      body: JSON.stringify({
        otp: deleteOtp,
        confirmationText: deleteConfirmationText,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setDeleteSubmitting(false);

    if (!response.ok) {
      const rawError = String(body?.error ?? '').toLowerCase();
      const pinAssertionFailed =
        response.status === 403 &&
        (rawError.includes('invalid pin assertion') || rawError.includes('pin verification required'));

      if (pinAssertionFailed) {
        setDeletePinAssertionToken(null);
        setDeleteStep(1);
        setDeletePinModalOpen(true);
      }

      toast.showToast(mapError(body?.error ?? 'Delete account failed', t, locale), 'error');
      if (response.status === 400 && typeof body?.expectedPhrase === 'string') {
        setDeleteConfirmationText(String(body.expectedPhrase));
      }
      return;
    }

    toast.showToast(
      locale === 'th' ? 'เธเธณเธเธญเธฅเธเธเธฑเธเธเธตเธ–เธนเธเธเธฑเธเธ—เธถเธเนเธฅเนเธง เธฃเธฐเธเธเธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธซเนเธญเธฑเธ•เนเธเธกเธฑเธ•เธด' : 'Deletion request saved. You have been signed out.',
      'success',
    );
    router.push('/login');
    router.refresh();
  }, [deleteConfirmationText, deleteOtp, deletePinAssertionToken, deleteSubmitting, locale, router, t, toast]);

  const logout = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.showToast(
          mapError(
            body?.error ?? (locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธกเนเธชเธณเน€เธฃเนเธ' : 'Logout failed'),
            t,
            locale,
          ),
          'error',
        );
        setLoading(false);
        return;
      }

      toast.showToast(locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธฅเนเธง' : 'Signed out', 'success');
      router.push('/login');
      router.refresh();
    } catch {
      toast.showToast(
        locale === 'th' ? 'เน€เธเธฃเธทเธญเธเนเธฒเธขเธกเธตเธเธฑเธเธซเธฒ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน' : 'Network error. Please try again.',
        'error',
      );
      setLoading(false);
    }
  }, [loading, locale, router, t, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (deleteOtpCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setDeleteOtpCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deleteOtpCooldown]);

  useEffect(() => {
    if (active !== 'email') return;
    const timer = window.setTimeout(() => {
      setEmailStep('enter_email');
      setEmailOtp('');
      setResendIn(0);
      setShowUseLatestOtp(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (active !== 'email' || emailStep !== 'enter_otp' || emailOtp.length !== 6) return;
    const timer = window.setTimeout(() => {
      void confirmEmailChange();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, confirmEmailChange, emailOtp, emailStep]);

  const resendLabel =
    resendIn > 0
      ? `${locale === 'th' ? 'เธชเนเธเนเธซเธกเนเนเธ' : 'Resend in'} ${resendIn}s`
      : locale === 'th'
        ? 'เธชเนเธ OTP เนเธซเธกเน'
        : 'Resend OTP';

  const canUseAdminQr = adminFeaturesEnabled && profileStatus === 'active' && ['admin', 'super_admin'].includes(profileRole);
  const isDeletePhraseMatched = normalizeSpaces(deleteConfirmationText) === normalizeSpaces(deleteExpectedText);
  const canMoveDeleteStep2 = Boolean(deletePinAssertionToken);
  const canMoveDeleteStep3 = /^\d{6}$/.test(deleteOtp);
  const canMoveDeleteStep4 = isDeletePhraseMatched;

  const menuBtn = (
    key: Exclude<SettingsSection, ''>,
    title: string,
    Icon: LucideIcon,
  ) => (
    <button
      key={key}
      type='button'
      onClick={() => openSection(key)}
      className='group flex min-h-[58px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
    >
      <span className='inline-flex items-center gap-3'>
        <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2 text-sky-300 group-hover:text-cyan-200'>
          <Icon className='h-4 w-4' />
        </span>
        <span className='text-app-h3 font-semibold text-slate-100'>{title}</span>
      </span>
      <ChevronRight className='h-4 w-4 text-slate-300' />
    </button>
  );

  const nameView = (
    <Card className='space-y-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4 shadow-[var(--glow-soft)]'>
      <div className='space-y-1.5'>
        <p className='form-label text-slate-300'>
          {locale === 'th' ? 'เธเธทเนเธญเนเธเธฃเนเธเธฅเน' : 'Profile name'}
        </p>
        <Input
          value={fullName}
          placeholder={t('settings.fullNamePlaceholder')}
          onChange={(event) => setFullName(event.target.value)}
          className='h-10 rounded-xl bg-[var(--surface-1)] text-slate-100 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100'
        />
      </div>
      <div className='space-y-1.5'>
        <p className='form-label text-slate-300'>Email</p>
        <Input value={profileEmail} readOnly className='h-10 rounded-xl bg-[var(--surface-1)] text-slate-200' />
      </div>
      <div className='space-y-1.5'>
        <p className='form-label text-slate-300'>
          {locale === 'th' ? 'เธฃเธซเธฑเธชเธเนเธฒเธ' : 'Password'}
        </p>
        <Input value='โ€ขโ€ขโ€ขโ€ขโ€ขโ€ขโ€ขโ€ข' readOnly className='h-10 rounded-xl bg-[var(--surface-1)] text-slate-200 tracking-[0.2em]' />
      </div>
      <Button onClick={() => void updateProfile()} disabled={loading} className='h-10 rounded-xl'>
        {loading ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ...' : 'Saving...') : t('settings.updateName')}
      </Button>
      <div className='rounded-2xl border border-rose-300/35 bg-rose-500/10 p-3'>
        <p className='text-app-caption text-rose-100'>
          {locale === 'th'
            ? 'เธซเธฒเธเธ•เนเธญเธเธเธฒเธฃเธฅเธเธเธฑเธเธเธตเนเธฅเธฐเธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”เธเธญเธเธเธธเธ“ เธชเธฒเธกเธฒเธฃเธ–เธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธ”เนเธเธฒเธเธเธธเนเธกเธ”เนเธฒเธเธฅเนเธฒเธ'
            : 'If you want to delete your account and all data, continue from the button below.'}
        </p>
        <Button
          type='button'
          variant='destructive'
          className='mt-3 h-10 w-full rounded-xl'
          onClick={openDeleteModal}
        >
          <Trash2 className='mr-2 h-4 w-4' />
          {locale === 'th' ? 'เธฅเธเธเธฑเธเธเธตเนเธฅเธฐเธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”' : 'Delete account and all data'}
        </Button>
      </div>
    </Card>
  );

  const emailStepOne = (
    <Card className='space-y-4 rounded-[24px] border-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700 p-5 text-white shadow-[0_18px_40px_rgba(30,64,175,0.35)]'>
      <div>
        <p className='text-app-body font-semibold text-blue-100'>
          {locale === 'th' ? 'เน€เธเธฅเธตเนเธขเธเธญเธตเน€เธกเธฅเธเธฑเธเธเธต' : 'Change account email'}
        </p>
        <p className='mt-1 text-app-caption text-blue-100/90'>
          {locale === 'th'
            ? 'เธเธฃเธญเธเธญเธตเน€เธกเธฅเนเธซเธกเน เธเธฒเธเธเธฑเนเธเธฃเธฐเธเธเธเธฐเธชเนเธ OTP เธขเธทเธเธขเธฑเธ'
            : 'Enter your new email. We will send OTP for verification.'}
        </p>
      </div>
      <Input
        type='email'
        value={newEmail}
        placeholder={t('settings.newEmailPlaceholder')}
        onChange={(event) => setNewEmail(event.target.value)}
        className='h-10 rounded-2xl border-2 border-blue-300 bg-white text-slate-900 placeholder:text-slate-400'
      />
      <div className='grid grid-cols-2 gap-2'>
        <Button
          variant='secondary'
          className='h-10 rounded-2xl'
          onClick={goMenuRoot}
          disabled={emailLoading}
        >
          {locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}
        </Button>
        <Button
          className='h-10 rounded-2xl bg-white text-blue-900 hover:bg-blue-50'
          onClick={() => void sendEmailOtp()}
          disabled={emailLoading || resendIn > 0}
        >
          {resendIn > 0 ? `${locale === 'th' ? 'เธชเนเธเนเธซเธกเนเนเธ' : 'Resend in'} ${resendIn}s` : t('settings.requestEmailChange')}
        </Button>
      </div>
      <div className='rounded-xl border border-cyan-200/40 bg-cyan-300/20 px-3 py-2 text-app-caption font-medium text-cyan-100'>
        {locale === 'th'
          ? 'เธซเธฒเธเนเธ”เนเธฃเธฑเธ OTP เนเธฅเนเธง เนเธกเนเธ•เนเธญเธเธเธ”เธเธญเธเนเธณ เนเธซเนเนเธเน OTP เธฅเนเธฒเธชเธธเธ”เนเธเธญเธตเน€เธกเธฅ'
          : 'If OTP already arrived, do not request again. Use the latest OTP.'}
      </div>
      {showUseLatestOtp ? (
        <Button
          variant='secondary'
          className='h-10 rounded-xl border border-white/40 bg-white/15 text-white hover:bg-white/20'
          onClick={() => setEmailStep('enter_otp')}
          disabled={emailLoading}
        >
          {locale === 'th' ? 'เนเธเน OTP เธฅเนเธฒเธชเธธเธ”' : 'Use latest OTP'}
        </Button>
      ) : null}
    </Card>
  );

  const emailStepTwo = (
    <Card className='space-y-4 rounded-[24px] border-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700 p-5 text-white shadow-[0_18px_40px_rgba(30,64,175,0.35)]'>
      <p className='text-app-body font-semibold text-blue-100'>OTP 6-digit</p>
      <OtpInput value={emailOtp} onChange={setEmailOtp} length={6} ariaLabel={t('otpInput.ariaLabel')} />
      <div className='rounded-xl border border-cyan-200/40 bg-cyan-300/20 px-3 py-2 text-app-caption font-medium text-cyan-100'>
        {emailAutoLoading
          ? locale === 'th'
            ? 'เธเธณเธฅเธฑเธเธขเธทเธเธขเธฑเธ OTP เนเธฅเธฐเธเธฑเธเธ—เธถเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธด...'
            : 'Verifying OTP and saving automatically...'
          : locale === 'th'
            ? 'เธเธฃเธญเธ OTP 6 เธซเธฅเธฑเธ เธฃเธฐเธเธเธเธฐเธขเธทเธเธขเธฑเธเนเธซเนเธญเธฑเธ•เนเธเธกเธฑเธ•เธด'
            : 'Enter 6-digit OTP. Verification runs automatically.'}
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <Button
          variant='secondary'
          className='h-10 rounded-xl'
          onClick={() => {
            setEmailStep('enter_email');
            setEmailOtp('');
            setResendIn(0);
          }}
          disabled={emailAutoLoading}
        >
          {locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}
        </Button>
        <Button
          className='h-10 rounded-xl bg-white text-blue-900 hover:bg-blue-50'
          onClick={() => void sendEmailOtp()}
          disabled={emailLoading || resendIn > 0}
        >
          {resendLabel}
        </Button>
      </div>
    </Card>
  );

  const emailView = emailStep === 'enter_email' ? emailStepOne : emailStepTwo;

  const passwordView = (
    <Card className='space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <Input
        type='password'
        value={newPassword}
        placeholder={t('settings.newPasswordPlaceholder')}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <Button
        onClick={() => void updatePassword()}
        disabled={loading || passwordSaving}
        className='h-10 rounded-xl'
      >
        {passwordSaving
          ? locale === 'th'
            ? 'เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ...'
            : 'Saving...'
          : t('settings.updatePassword')}
      </Button>
    </Card>
  );

  const pinView = (
    <div className='space-y-2'>
      <p className='text-app-caption text-slate-300'>
        {locale === 'th' ? 'เน€เธฅเธทเธญเธเธเธฑเธ”เธเธฒเธฃ PIN เธซเธฃเธทเธญเธเธณเธซเธเธ” PIN เธฃเธฒเธขเน€เธกเธเธน' : 'Change PIN or manage PIN per menu.'}
      </p>
      <Button
        type='button'
        className='h-10 w-full rounded-xl'
        onClick={() => {
          setCurrentPin('');
          setNewPin('');
          setConfirmPin('');
          setPinDialogOpen(true);
        }}
      >
        {locale === 'th'
          ? hasExistingPin
            ? 'เน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธช PIN เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข'
            : 'เธ•เธฑเนเธเธฃเธซเธฑเธช PIN เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข'
          : hasExistingPin
            ? 'Change Security PIN'
            : 'Set Security PIN'}
      </Button>
      <Button type='button' variant='secondary' className='h-10 w-full rounded-xl' onClick={() => router.push('/settings/pin-security')}>
        {locale === 'th' ? 'เธ•เธฑเนเธเธเนเธฒ PIN เธฃเธฒเธขเน€เธกเธเธน' : 'PIN Per-Menu Settings'}
      </Button>
    </div>
  );

  const languageView = (
    <Card className='space-y-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th' ? 'เน€เธฅเธทเธญเธเธ เธฒเธฉเธฒเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเนเธเนเธเธฒเธ' : 'Choose your preferred app language.'}
      </p>
      <div className='grid grid-cols-2 gap-2'>
        <Button
          variant={locale === 'th' ? 'default' : 'secondary'}
          className='h-10 rounded-xl'
          onClick={() => setLocale('th')}
        >
          เนเธ—เธข
        </Button>
        <Button
          variant={locale === 'en' ? 'default' : 'secondary'}
          className='h-10 rounded-xl'
          onClick={() => setLocale('en')}
        >
          English
        </Button>
      </div>
    </Card>
  );

  const themeOption = (mode: ThemeMode, label: string, Icon: LucideIcon) => (
    <button
      key={mode}
      type='button'
      onClick={() => setThemeMode(mode)}
      className={
        'flex min-h-[52px] items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ' +
        (themeMode === mode
          ? 'border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-2)_84%,#4f79ff_16%)] text-slate-100 shadow-[var(--glow-soft)]'
          : 'border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]')
      }
      aria-pressed={themeMode === mode}
    >
      <span className='inline-flex items-center gap-2 text-app-body font-semibold'>
        <Icon className='h-4 w-4' />
        {label}
      </span>
      {themeMode === mode ? (
        <span className='text-app-micro font-semibold'>
          {locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธเน' : 'Active'}
        </span>
      ) : null}
    </button>
  );

  const themeView = (
    <Card className='space-y-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th'
          ? `เน€เธฅเธทเธญเธเธเธตเธกเธ—เธฑเนเธเธฃเธฐเธเธ (เธ•เธญเธเธเธตเนเนเธชเธ”เธเธเธฅ: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`
          : `Choose app-wide theme (currently showing: ${resolvedTheme})`}
      </p>
      <div className='grid gap-2'>
        {themeOption('auto', locale === 'th' ? 'เธญเธฑเธ•เนเธเธกเธฑเธ•เธด' : 'Auto', SunMoon)}
        {themeOption('light', locale === 'th' ? 'เธชเธงเนเธฒเธ' : 'Light', Sun)}
        {themeOption('dark', locale === 'th' ? 'เน€เธเนเธก' : 'Dark', Moon)}
      </div>
    </Card>
  );

  const displayScaleOption = (mode: DisplayScaleMode, label: string, description: string) => (
    <button
      key={mode}
      type='button'
      onClick={() => setDisplayScaleMode(mode)}
      className={
        'flex min-h-[56px] items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ' +
        (displayScaleMode === mode
          ? 'border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-2)_84%,#4f79ff_16%)] text-slate-100 shadow-[var(--glow-soft)]'
          : 'border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]')
      }
      aria-pressed={displayScaleMode === mode}
    >
      <span className='min-w-0'>
        <span className='block text-app-body font-semibold'>{label}</span>
        <span className='block text-app-caption text-slate-300'>{description}</span>
      </span>
      {displayScaleMode === mode ? (
        <span className='text-app-micro font-semibold'>
          {locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธเน' : 'Active'}
        </span>
      ) : null}
    </button>
  );

  const displayView = (
    <Card className='space-y-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th'
          ? 'เน€เธฅเธทเธญเธเธฃเธฐเธ”เธฑเธเธเธเธฒเธ”เธ•เธฑเธงเธญเธฑเธเธฉเธฃ เธเธธเนเธก เนเธญเธเธญเธ เนเธฅเธฐเธฃเธฐเธขเธฐเธซเนเธฒเธเธ—เธฑเนเธเนเธญเธ'
          : 'Choose app-wide text, button, icon, and spacing scale.'}
      </p>
      <div className='grid gap-2'>
        {displayScaleOption(
          'comfort',
          locale === 'th' ? 'Comfort (เนเธซเธเน เธญเนเธฒเธเธเนเธฒเธข)' : 'Comfort (Larger)',
          locale === 'th' ? 'เน€เธซเธกเธฒเธฐเธเธฑเธเธเธฒเธฃเนเธเนเธเธฒเธเธ—เธธเธเธงเธฑเธ เธเธเธฒเธ”เนเธ•เธฐเธเนเธฒเธขเธ—เธตเนเธชเธธเธ”' : 'Best for readability and larger touch targets.',
        )}
        {displayScaleOption(
          'compact',
          locale === 'th' ? 'Compact (เธเธฃเธฐเธเธฑเธ)' : 'Compact',
          locale === 'th' ? 'เนเธชเธ”เธเธเนเธญเธกเธนเธฅเนเธ”เนเธกเธฒเธเธเธถเนเธเนเธเธซเธเนเธฒเธเธญเน€เธ”เธตเธขเธง' : 'Fits more content on one screen.',
        )}
        {displayScaleOption(
          'standard',
          locale === 'th' ? 'Standard' : 'Standard',
          locale === 'th' ? 'เธเธเธฒเธ”เธกเธฒเธ•เธฃเธเธฒเธเนเธเธเธชเธกเธ”เธธเธฅ' : 'Balanced default scale.',
        )}
      </div>
    </Card>
  );

  const logoutView = (
    <Card className='space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th'
          ? 'เธขเธทเธเธขเธฑเธเธเธฒเธฃเธญเธญเธเธเธฒเธเธฃเธฐเธเธเธเธเธญเธธเธเธเธฃเธ“เนเธเธตเน'
          : 'Confirm to sign out from this device.'}
      </p>
      <Button variant='destructive' className='h-10 rounded-xl' onClick={() => void logout()} disabled={loading}>
        {loading ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธญเธญเธเธเธฒเธเธฃเธฐเธเธ...' : 'Signing out...') : (locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธ' : 'Sign out')}
      </Button>
    </Card>
  );

  const activeTitle =
    active === 'name'
      ? t('settings.nameTitle')
      : active === 'email'
        ? t('settings.emailTitle')
        : active === 'password'
          ? t('settings.passwordTitle')
          : active === 'pin'
            ? locale === 'th'
              ? 'PIN เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข'
              : 'PIN Security'
          : active === 'language'
            ? locale === 'th'
              ? 'เน€เธเธฅเธตเนเธขเธเธ เธฒเธฉเธฒ'
              : 'Change language'
            : active === 'theme'
              ? locale === 'th'
                ? 'เธเธตเธกเนเธญเธ'
                : 'App theme'
            : active === 'display'
              ? locale === 'th'
                ? 'ขนาดการแสดงผล'
                : 'Display scale'
            : locale === 'th'
              ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธ'
              : 'Sign out';

  const body =
    active === 'name'
      ? nameView
      : active === 'email'
        ? emailView
        : active === 'password'
          ? passwordView
          : active === 'pin'
            ? pinView
          : active === 'language'
            ? languageView
            : active === 'theme'
              ? themeView
            : active === 'display'
              ? displayView
            : active === 'logout'
              ? logoutView
              : null;

  return (
    <section className='space-y-5 pb-24 pt-[calc(env(safe-area-inset-top)+10px)]'>
      {active ? null : (
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h1 className='text-app-h1 font-semibold text-slate-100'>{t('settings.title')}</h1>
            <p className='text-app-body text-slate-300'>
              {locale === 'th' ? 'เน€เธฅเธทเธญเธเน€เธกเธเธนเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธเธฃเธฑเธเนเธ•เนเธเนเธเธฃเนเธเธฅเนเธเธญเธเธเธธเธ“' : 'Select a menu to update your profile settings.'}
            </p>
          </div>
          {canUseAdminQr ? (
            <button
              type='button'
              onClick={() => router.push('/settings/admin-qr-login')}
              className='inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-[0_8px_18px_rgba(37,99,235,0.16)] transition hover:bg-blue-100'
              aria-label={locale === 'th' ? 'เธชเนเธเธ QR เธชเธณเธซเธฃเธฑเธ Admin Login' : 'Scan QR for admin login'}
              title={locale === 'th' ? 'เธชเนเธเธ QR เธชเธณเธซเธฃเธฑเธ Admin Login' : 'Scan Admin Login QR'}
            >
              <QrCode className='h-4 w-4' />
            </button>
          ) : null}
        </div>
      )}

      <div className={active ? 'hidden' : 'grid gap-3'}>
        {menuBtn('name', t('settings.nameTitle'), UserRound)}
        {menuBtn('email', t('settings.emailTitle'), Mail)}
        {menuBtn('password', t('settings.passwordTitle'), Lock)}
        {menuBtn('pin', locale === 'th' ? 'PIN เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข' : 'PIN Security', KeyRound)}
        {menuBtn('language', locale === 'th' ? 'เน€เธเธฅเธตเนเธขเธเธ เธฒเธฉเธฒ' : 'Change language', Languages)}
        {menuBtn('theme', locale === 'th' ? 'เธเธตเธกเนเธญเธ' : 'App theme', SunMoon)}
        {menuBtn('display', locale === 'th' ? 'ขนาดการแสดงผล' : 'Display scale', Smartphone)}

        <button
          type='button'
          onClick={() => router.push('/settings/notifications')}
          className='group flex min-h-[58px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2 text-sky-300 group-hover:text-cyan-200'>
              <Bell className='h-4 w-4' />
            </span>
            <span className='text-app-h3 font-semibold text-slate-100'>
              {locale === 'th' ? 'เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ' : 'Notifications'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-300' />
        </button>

        <button
          type='button'
          onClick={() => router.push('/settings/lock-screen')}
          className='group flex min-h-[58px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2 text-sky-300 group-hover:text-cyan-200'>
              <Lock className='h-4 w-4' />
            </span>
            <span className='text-app-h3 font-semibold text-slate-100'>
              {locale === 'th' ? 'เธฅเนเธญเธเธซเธเนเธฒเธเธญ' : 'Lock screen'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-300' />
        </button>

        <button
          type='button'
          onClick={() => router.push('/help-center')}
          className='group flex min-h-[58px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2 text-sky-300 group-hover:text-cyan-200'>
              <LifeBuoy className='h-4 w-4' />
            </span>
            <span className='text-app-h3 font-semibold text-slate-100'>
              {locale === 'th' ? 'เธจเธนเธเธขเนเธเนเธงเธขเน€เธซเธฅเธทเธญ' : 'Help center'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-300' />
        </button>

        <button
          type='button'
          onClick={() => router.push('/settings/printer')}
          className='group flex min-h-[58px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2 text-sky-300 group-hover:text-cyan-200'>
              <Printer className='h-4 w-4' />
            </span>
            <span className='text-app-h3 font-semibold text-slate-100'>
              {locale === 'th' ? 'เน€เธเธฃเธทเนเธญเธเธเธดเธกเธเน Bluetooth' : 'Bluetooth Printer'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-300' />
        </button>
        <TopQuickActions variant='settings-menu' showSecondaryActions={false} />
        {menuBtn('logout', locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธ' : 'Sign out', LogOut)}
      </div>

      {body ? (
        <div className='mt-1 space-y-3'>
          <div className='mx-auto w-full max-w-[520px] rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 pb-6 pt-4 shadow-[var(--glow-soft)]'>
            <div className='mb-4 flex items-center gap-2'>
              <button
                type='button'
                className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-200'
                onClick={goMenuRoot}
                aria-label={locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธ' : 'Back'}
              >
                <ChevronLeft className='h-4 w-4' />
              </button>
              <h2 className='text-app-h3 font-semibold text-slate-100'>{activeTitle}</h2>
            </div>
            {body}
          </div>
        </div>
      ) : null}

      {pinDialogOpen ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[2px]'
          onClick={() => {
            if (pinSaving) return;
            setPinDialogOpen(false);
          }}
        >
          <div className='w-full max-w-[480px]' onClick={(event) => event.stopPropagation()}>
            <Card className='space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-1)] p-4'>
              <h3 className='text-app-h3 font-semibold text-slate-100'>
                {locale === 'th'
                  ? hasExistingPin
                    ? 'เน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธช PIN เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข'
                    : 'เธ•เธฑเนเธเธฃเธซเธฑเธช PIN เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข'
                  : hasExistingPin
                    ? 'Change Security PIN'
                    : 'Set Security PIN'}
              </h3>

              {hasExistingPin ? (
                <Input
                  type='password'
                  inputMode='numeric'
                  maxLength={6}
                  value={currentPin}
                  placeholder={locale === 'th' ? 'PIN เธเธฑเธเธเธธเธเธฑเธ 6 เธซเธฅเธฑเธ' : 'Current 6-digit PIN'}
                  onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              ) : null}
              <Input
                type='password'
                inputMode='numeric'
                maxLength={6}
                value={newPin}
                placeholder={locale === 'th' ? 'PIN เนเธซเธกเน 6 เธซเธฅเธฑเธ' : 'New 6-digit PIN'}
                onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <Input
                type='password'
                inputMode='numeric'
                maxLength={6}
                value={confirmPin}
                placeholder={locale === 'th' ? 'เธขเธทเธเธขเธฑเธ PIN 6 เธซเธฅเธฑเธ' : 'Confirm 6-digit PIN'}
                onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />

              <div className='grid grid-cols-2 gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  className='h-10 rounded-xl'
                  onClick={() => setPinDialogOpen(false)}
                  disabled={pinSaving}
                >
                  {locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}
                </Button>
                <Button onClick={() => void updatePin()} disabled={pinSaving} className='h-10 rounded-xl'>
                  {pinSaving
                    ? locale === 'th'
                      ? 'เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ...'
                      : 'Saving...'
                    : locale === 'th'
                      ? hasExistingPin
                        ? 'เน€เธเธฅเธตเนเธขเธ PIN'
                        : 'เธ•เธฑเนเธเธเนเธฒ PIN'
                      : hasExistingPin
                        ? 'Change PIN'
                        : 'Set PIN'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[2px]'
          onClick={closeDeleteModal}
        >
          <div className='w-full max-w-[540px]' onClick={(event) => event.stopPropagation()}>
            <Card className='space-y-4 rounded-[24px] border border-rose-300/30 bg-[var(--surface-1)] p-5'>
              <div className='space-y-2'>
                <h3 className='text-app-h3 font-semibold text-rose-100'>
                  {locale === 'th' ? 'เธขเธทเธเธขเธฑเธเธเธฒเธฃเธฅเธเธเธฑเธเธเธตเนเธฅเธฐเธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”' : 'Confirm account and data deletion'}
                </h3>
                <p className='text-app-caption text-slate-300'>
                  {locale === 'th'
                    ? `เธเธฑเนเธเธ•เธญเธ ${deleteStep === 4 ? 'เธขเธทเธเธขเธฑเธเธชเธธเธ”เธ—เนเธฒเธข' : `${deleteStep}/3`}`
                    : deleteStep === 4
                      ? 'Final confirmation'
                      : `Step ${deleteStep}/3`}
                </p>
              </div>

              {deleteStep === 1 ? (
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <p className='form-label text-slate-300'>{locale === 'th' ? '1) เธขเธทเธเธขเธฑเธ PIN' : '1) Verify PIN'}</p>
                    <Button
                      type='button'
                      className='h-10 w-full rounded-xl'
                      variant={deletePinAssertionToken ? 'secondary' : 'default'}
                      onClick={() => setDeletePinModalOpen(true)}
                    >
                      {deletePinAssertionToken
                        ? locale === 'th'
                          ? 'เธขเธทเธเธขเธฑเธ PIN เนเธฅเนเธง'
                          : 'PIN verified'
                        : locale === 'th'
                          ? 'เธเธ”เน€เธเธทเนเธญเธขเธทเธเธขเธฑเธ PIN'
                          : 'Verify PIN'}
                    </Button>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={closeDeleteModal}>
                      {locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      disabled={!canMoveDeleteStep2}
                      onClick={() => setDeleteStep(2)}
                    >
                      {locale === 'th' ? 'เธเธฑเนเธเธ•เธญเธเธ–เธฑเธ”เนเธ' : 'Next step'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {deleteStep === 2 ? (
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <p className='form-label text-slate-300'>{locale === 'th' ? '2) เธเธฃเธญเธ OTP เธเธฒเธเธญเธตเน€เธกเธฅ' : '2) Enter OTP from email'}</p>
                    <OtpInput value={deleteOtp} onChange={setDeleteOtp} length={6} ariaLabel='Delete account OTP input' />
                    <Button
                      type='button'
                      variant='secondary'
                      className='h-10 w-full rounded-xl'
                      onClick={() => void sendDeleteOtp()}
                      disabled={deleteOtpSending || deleteOtpCooldown > 0}
                    >
                      {deleteOtpCooldown > 0
                        ? `${locale === 'th' ? 'เธชเนเธเนเธซเธกเนเนเธ' : 'Resend in'} ${deleteOtpCooldown}s`
                        : locale === 'th'
                          ? 'เธชเนเธ OTP เนเธเธขเธฑเธเธญเธตเน€เธกเธฅ'
                          : 'Send OTP to email'}
                    </Button>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => setDeleteStep(1)}>
                      {locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธ' : 'Back'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      disabled={!canMoveDeleteStep3}
                      onClick={() => setDeleteStep(3)}
                    >
                      {locale === 'th' ? 'เธเธฑเนเธเธ•เธญเธเธ–เธฑเธ”เนเธ' : 'Next step'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {deleteStep === 3 ? (
                <div className='space-y-4'>
                  <div className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3'>
                    <p className='text-app-caption text-slate-300'>
                      {locale === 'th' ? 'เธเนเธญเธเธงเธฒเธกเธ—เธตเนเธ•เนเธญเธเธเธดเธกเธเนเนเธซเนเธ•เธฃเธ:' : 'Required confirmation text:'}
                    </p>
                    <p className='mt-1 break-words text-app-body font-semibold text-slate-100'>{deleteExpectedText}</p>
                  </div>
                  <div className='space-y-2'>
                    <p className='form-label text-slate-300'>{locale === 'th' ? '3) เธเธดเธกเธเนเธเนเธญเธเธงเธฒเธกเธขเธทเธเธขเธฑเธ' : '3) Type confirmation text'}</p>
                    <Input
                      value={deleteConfirmationText}
                      onChange={(event) => setDeleteConfirmationText(event.target.value)}
                      placeholder={deleteExpectedText}
                      className='h-10 rounded-xl bg-[var(--surface-2)] text-slate-100'
                    />
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => setDeleteStep(2)}>
                      {locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธ' : 'Back'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      disabled={!canMoveDeleteStep4}
                      onClick={() => setDeleteStep(4)}
                    >
                      {locale === 'th' ? 'เธเธฑเนเธเธ•เธญเธเธ–เธฑเธ”เนเธ' : 'Next step'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {deleteStep === 4 ? (
                <div className='space-y-4'>
                  <div className='space-y-3 text-app-caption text-slate-200'>
                    <p>
                      เธเธธเธ“เนเธเนเนเธ เธงเนเธฒเธเธฐเธ—เธณเธเธฒเธฃเธฅเธเธเธฑเธเธเธต เธเธตเน เนเธฅเธฐ เธเนเธญเธกเธนเธฅเธเธญเธเธเธธเธ“เธเธฐเธ–เธนเธเธฅเธ เนเธเธ”เนเธงเธข เธซเธฒเธเธ•เนเธญเธเธเธฒเธฃเธฅเธ เนเธซเน เธเธฑเธ”เธฅเธญเธเธเนเธญเธกเธนเธฅเธเธญเธเธเธธเธ“เนเธงเน
                      เน€เธเธทเนเธญเนเธกเนเนเธซเนเน€เธเธดเธ”เธเธงเธฒเธกเน€เธชเธตเธขเธซเธฒเธขเธเธถเนเธ เธ•เนเธญเธเธธเธ“เน€เธญเธ
                    </p>
                    <p>
                      เธซเธฒเธเธขเธทเธเธขเธฑเธเธฃเธญเธเธชเธธเธ”เธ—เนเธฒเธขเธเธตเน เนเธฅเนเธง เธฃเธฐเธเธ เธเธฐเธขเธฑเธเน€เธเนเธเธเนเธญเธกเธนเธฅเธเธญเธเธเธธเธ“ เนเธงเน 7 เธงเธฑเธ เน€เธเธทเนเธญเธ—เธตเนเธชเธฒเธกเธฒเธฃเธ–เธเธณเธกเธฒเธเธนเนเธเธฑเธเธเธต เนเธฅเธฐเธเนเธญเธกเธนเธฅเธเธญเธเธเธธเธ“เธเธฐเธขเธฑเธเธเธเธเธฅเธฑเธเธกเธฒเน€เธซเธกเธทเธญเธเน€เธ”เธดเธก
                      เนเธ•เน เธซเธฒเธเน€เธฅเธข 7 เธงเธฑเธเนเธเนเธฅเนเธง เธเธธเธ“เธเธฐเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธนเนเธเธฑเธเธเธต เธเธญเธเธเธธเธ“เนเธ”เน เธญเธตเธ
                    </p>
                    <p>
                      เนเธ•เนเธเธธเธ“เธขเธฑเธเธกเธตเนเธญเธเธฒเธช เธญเธตเธเธเธฃเธฑเนเธ เธซเธฒเธเธ•เนเธญเธเธเธฒเธฃเธเธฐเนเธเนเธเธฒเธเธเธฑเธเธเธต เธเธญเธเธเธธเธ“เธ•เนเธญ เนเธ”เธขเธ•เธดเธ”เธ•เนเธญเธ—เธตเธกเธเธฒเธเธเธฑเธเธเธญเธฃเนเธ•เนเธ”เน เธ เธฒเธขเนเธ 30 เธงเธฑเธ เธซเธฅเธฑเธเธเธฒเธเธ—เธตเน
                      เธเธ”เธขเธทเธเธขเธฑเธเธฃเธญเธเธชเธธเธ”เธ—เนเธฒเธข เธเนเธญเธกเธนเธฅเธเธญเธเธเธธเธ“เธขเธฑเธเธเธเธญเธขเธนเนเธ•เนเธญเธญเธตเธ 30 เธงเธฑเธ เธซเธฒเธเน€เธฅเธข 30 เธงเธฑเธเนเธฅเนเธงเธเธธเธ“เนเธกเนเธ•เธดเธ”เธ•เนเธญเธกเธฒเธ—เธฒเธเน€เธฃเธฒ เธเนเธญเธกเธนเธฅเธเธฐเธ–เธนเธเธฅเธเธญเธขเนเธฒเธเน€เธเนเธเธ—เธฒเธเธเธฒเธฃเนเธฅเธฐเธ–เธฒเธงเธฃ
                      เนเธฅเธฐเธเธฐเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธนเนเนเธ”เนเธญเธตเธเน€เธฅเธข
                    </p>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button
                      type='button'
                      variant='secondary'
                      className='h-10 rounded-xl'
                      onClick={() => setDeleteStep(3)}
                      disabled={deleteSubmitting}
                    >
                      {locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธ' : 'Back'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      onClick={() => void confirmDeleteAccount()}
                      disabled={deleteSubmitting}
                    >
                      {deleteSubmitting
                        ? locale === 'th'
                          ? 'เธเธณเธฅเธฑเธเธขเธทเธเธขเธฑเธ...'
                          : 'Confirming...'
                        : locale === 'th'
                          ? 'เธขเธทเธเธขเธฑเธเธชเธธเธ”เธ—เนเธฒเธข'
                          : 'Final confirm'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      ) : null}

      {deletePinModalOpen ? (
        <PinModal
          action='delete_account'
          actionLabel={locale === 'th' ? 'เธฅเธเธเธฑเธเธเธตเนเธฅเธฐเธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”' : 'delete your account and all data'}
          targetItemId={profileUserId || undefined}
          onClose={() => setDeletePinModalOpen(false)}
          onVerified={(assertionToken) => {
            setDeletePinAssertionToken(assertionToken);
            setDeletePinModalOpen(false);
            setDeleteStep(2);
            toast.showToast(locale === 'th' ? 'เธขเธทเธเธขเธฑเธ PIN เธชเธณเน€เธฃเนเธ' : 'PIN verified.', 'success');
          }}
        />
      ) : null}
    </section>
  );
}

