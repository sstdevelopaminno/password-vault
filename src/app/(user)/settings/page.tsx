'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, ChevronLeft, ChevronRight, KeyRound, Languages, LifeBuoy, Lock, LogOut, Mail, QrCode, RefreshCw, Shield, UserRound } from 'lucide-react';
import { OtpInput } from '@/components/auth/otp-input';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { TopQuickActions } from '@/components/layout/top-quick-actions';
import { useI18n } from '@/i18n/provider';
import {
  clampPinSessionTimeoutSec,
  DEFAULT_PIN_SESSION_TIMEOUT_SEC,
  PIN_SESSION_TIMEOUT_OPTIONS_SEC,
} from '@/lib/pin-session';

function digits(value: string) {
  return String(value).replace(/\D/g, '').slice(0, 6);
}

function mapError(message: unknown, t: (key: any) => string, locale: 'th' | 'en') {
  const text = String(message ?? '').toLowerCase();
  if (text.includes('token') || text.includes('invalid otp')) return t('verifyOtp.invalid');
  if (text.includes('duplicate key value') && text.includes('profiles_email_key')) {
    return locale === 'th'
      ? 'เธเธเธเนเธญเธกเธนเธฅเธเธฑเธเธเธตเธเนเธณ เธฃเธฐเธเธเธเธณเธฅเธฑเธเน€เธเธทเนเธญเธกเธเธฑเธเธเธตเน€เธ”เธดเธกเนเธซเนเธญเธฑเธ•เนเธเธกเธฑเธ•เธด เธเธฃเธธเธ“เธฒเธฅเธญเธเธญเธตเธเธเธฃเธฑเนเธ'
      : 'Duplicate profile detected. Please retry once while the system reconciles your account.';
  }
  if (text.includes('rate limit')) {
    return locale === 'th'
      ? 'OTP เธ–เธนเธเธเธณเธเธฑเธ”เธเธงเธฒเธกเธ–เธตเน เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเนเนเธฅเธฐเนเธเน OTP เธฅเนเธฒเธชเธธเธ”เนเธเธญเธตเน€เธกเธฅ'
      : 'OTP is rate limited. Please wait and use the latest OTP from email.';
  }
  return String(message ?? 'Unknown error');
}

type SettingsSection = '' | 'name' | 'email' | 'password' | 'pin' | 'language' | 'logout';
const SETTINGS_SECTION_QUERY = 'section';

function parseSettingsSection(raw: string | null): SettingsSection {
 if (raw === 'name' || raw === 'email' || raw === 'password' || raw === 'pin' || raw === 'language' || raw === 'logout') {
 return raw;
 }
 return '';
}

export default function SettingsPage() {
  const toast = useToast();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  const searchParams = useSearchParams();
 const active = useMemo(() => parseSettingsSection(searchParams.get(SETTINGS_SECTION_QUERY)), [searchParams]);
 const openSection = useCallback((section: Exclude<SettingsSection, ''>) => {
 router.push('/settings?' + SETTINGS_SECTION_QUERY + '=' + section);
 }, [router]);
 const goMenuRoot = useCallback(() => {
 router.push('/settings');
 }, [router]);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileRole, setProfileRole] = useState('pending');
  const [profileStatus, setProfileStatus] = useState('pending_approval');
  const [pinSessionEnabled, setPinSessionEnabled] = useState(true);
  const [pinSessionTimeoutSec, setPinSessionTimeoutSec] = useState(DEFAULT_PIN_SESSION_TIMEOUT_SEC);
  const [pinSecuritySaving, setPinSecuritySaving] = useState(false);

  const [emailLoading, setEmailLoading] = useState(false);
  const [emailAutoLoading, setEmailAutoLoading] = useState(false);
  const [emailStep, setEmailStep] = useState('enter_email' as 'enter_email' | 'enter_otp');
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [showUseLatestOtp, setShowUseLatestOtp] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [passwordPin, setPasswordPin] = useState('');
  const [passwordPinLoading, setPasswordPinLoading] = useState(false);
  const [passwordStep, setPasswordStep] = useState('enter_password' as 'enter_password' | 'enter_pin');

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (active !== 'email') return;
    setEmailStep('enter_email');
    setEmailOtp('');
    setResendIn(0);
    setShowUseLatestOtp(false);
  }, [active]);

  useEffect(() => {
    if (active !== 'password') return;
    setPasswordStep('enter_password');
    setPasswordPin('');
  }, [active]);

  useEffect(() => {
    if (active !== 'email' || emailStep !== 'enter_otp' || emailOtp.length !== 6) return;
    void confirmEmailChange();
  }, [active, emailStep, emailOtp]);

  useEffect(() => {
    if (active !== 'password') return;
    if (passwordStep !== 'enter_pin') return;
    if (passwordPin.length !== 6) return;
    if (newPassword.length < 8) return;
    if (passwordPinLoading) return;
    void updatePassword();
  }, [active, passwordStep, passwordPin, newPassword, passwordPinLoading]);

  async function loadProfile() {
    const res = await fetch('/api/profile/me', { method: 'GET' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setFullName(String(body?.fullName ?? ''));
    setProfileEmail(String(body?.email ?? ''));
    setProfileRole(String(body?.role ?? 'pending'));
    setProfileStatus(String(body?.status ?? 'pending_approval'));
    setPinSessionEnabled(body?.pinSessionEnabled !== false);
    setPinSessionTimeoutSec(
      clampPinSessionTimeoutSec(body?.pinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC),
    );
  }

  async function apiCall(url: string, method: 'POST' | 'PATCH', payload: unknown, fallback: string) {
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
  }

  async function updateProfile() {
    const name = String(fullName).trim();
    if (name.length < 2) {
      toast.showToast(locale === 'th' ? 'เธเธทเนเธญเนเธเธฃเนเธเธฅเนเธชเธฑเนเธเน€เธเธดเธเนเธ' : 'Profile name is too short', 'error');
      return;
    }

    setLoading(true);
    const body = await apiCall('/api/profile/update', 'PATCH', { purpose: 'change_profile', fullName: name }, t('settings.updateFailed'));
    setLoading(false);
    if (!body) return;

    toast.showToast(String(body?.message ?? t('settings.profileUpdated')), 'success');
    goMenuRoot();
    void loadProfile();
  }

  function timeoutOptionLabel(sec: number) {
    if (sec < 60) return locale === 'th' ? `${sec} เธงเธดเธเธฒเธ—เธต` : `${sec}s`;
    const mins = Math.floor(sec / 60);
    return locale === 'th' ? `${mins} เธเธฒเธ—เธต` : `${mins} min`;
  }

  async function updatePinSecurity(enabled: boolean, nextTimeoutSec = pinSessionTimeoutSec) {
    if (pinSecuritySaving) return;
    setPinSecuritySaving(true);
    const safeTimeoutSec = clampPinSessionTimeoutSec(nextTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC);

    const body = await apiCall(
      '/api/profile/update',
      'PATCH',
      { purpose: 'change_pin_security', pinSessionEnabled: enabled, pinSessionTimeoutSec: safeTimeoutSec },
      t('settings.updateFailed'),
    );

    setPinSecuritySaving(false);
    if (!body) return;

    setPinSessionEnabled(enabled);
    setPinSessionTimeoutSec(safeTimeoutSec);
    toast.showToast(
      locale === 'th'
        ? enabled
          ? 'เน€เธเธดเธ”เธเธฒเธฃเธฅเนเธญเธเธซเธเนเธฒเธเธญเธ”เนเธงเธข PIN เนเธฅเนเธง'
          : 'เธเธดเธ”เธเธฒเธฃเธฅเนเธญเธเธซเธเนเธฒเธเธญเธ”เนเธงเธข PIN เนเธฅเนเธง'
        : enabled
          ? 'PIN screen lock enabled.'
          : 'PIN screen lock disabled.',
      'success',
    );
  }

  async function sendEmailOtp() {
    const email = String(newEmail).trim().toLowerCase();
    if (!email.includes('@')) {
      toast.showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธญเธตเน€เธกเธฅเนเธซเนเธ–เธนเธเธ•เนเธญเธ' : 'Invalid email', 'error');
      return;
    }

    if (resendIn > 0) {
      toast.showToast(
        locale === 'th'
          ? 'เธเธฃเธธเธ“เธฒเธฃเธญเธเนเธญเธเธเธญเธฃเธซเธฑเธชเนเธซเธกเน เนเธฅเธฐเนเธเน OTP เธฅเนเธฒเธชเธธเธ”เธเธฒเธเธญเธตเน€เธกเธฅเนเธ”เนเธ—เธฑเธเธ—เธต'
          : 'Please wait before resend and use your latest OTP now.',
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
      const raw = String(body?.error ?? '').toLowerCase();
      const goOtp = Boolean(body?.otpAlreadyRequested) || response.status === 429 || (raw.includes('email address') && raw.includes('is invalid'));
      if (goOtp) {
        setEmailStep('enter_otp');
        setResendIn(Number(body?.retryAfterSec || 60));
        setShowUseLatestOtp(true);
      }
      return;
    }

    setEmailStep('enter_otp');
    setEmailOtp('');
    setResendIn(60);
    toast.showToast(String(body?.message ?? t('settings.otpSent')), 'success');
  }

  async function confirmEmailChange() {
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
    void loadProfile();
  }

  function beginPasswordChange() {
    if (newPassword.length < 8) {
      toast.showToast(locale === 'th' ? 'เธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเนเธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 8 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ' : 'Password must be at least 8 characters', 'error');
      return;
    }
    setPasswordStep('enter_pin');
  }

  async function updatePassword() {
    if (newPassword.length < 8) {
      toast.showToast(locale === 'th' ? 'เธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเนเธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 8 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ' : 'Password must be at least 8 characters', 'error');
      return;
    }
    if (passwordPin.length !== 6) {
      toast.showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธ PIN 6 เธซเธฅเธฑเธเน€เธเธทเนเธญเธขเธทเธเธขเธฑเธ' : 'Please enter 6-digit PIN', 'error');
      return;
    }
    if (passwordPinLoading) return;

    setPasswordPinLoading(true);
    const pinRes = await fetch('/api/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: passwordPin, action: 'edit_secret' }),
    });
    const pinBody = await pinRes.json().catch(() => ({}));
    if (!pinRes.ok || !pinBody?.assertionToken) {
      setPasswordPinLoading(false);
      toast.showToast(mapError(pinBody?.error ?? 'Invalid PIN', t, locale), 'error');
      return;
    }

    const response = await fetch('/api/profile/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-pin-assertion': String(pinBody.assertionToken),
      },
      body: JSON.stringify({ purpose: 'change_password', newPassword }),
    });
    const body = await response.json().catch(() => ({}));
    setPasswordPinLoading(false);
    if (!response.ok) {
      toast.showToast(mapError(body?.error ?? t('settings.updateFailed'), t, locale), 'error');
      setPasswordPin('');
      return;
    }

    toast.showToast(String(body?.message ?? t('settings.profileUpdated')), 'success');
    goMenuRoot();
    setPasswordStep('enter_password');
    setNewPassword('');
    setPasswordPin('');
  }

  async function updatePin() {
    if (newPin.length !== 6 || confirmPin.length !== 6 || newPin !== confirmPin) {
      toast.showToast(t('settings.pinUpdateFailed'), 'error');
      return;
    }

    setLoading(true);
    const body = await apiCall('/api/pin/set', 'POST', { currentPin: currentPin || undefined, newPin, confirmPin }, t('settings.pinUpdateFailed'));
    setLoading(false);
    if (!body) return;

    toast.showToast(t('settings.pinUpdated'), 'success');
    goMenuRoot();
  }

  async function logout() {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.showToast(mapError(body?.error ?? (locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธกเนเธชเธณเน€เธฃเนเธ' : 'Logout failed'), t, locale), 'error');
        setLoading(false);
        return;
      }

      toast.showToast(locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธฅเนเธง' : 'Signed out', 'success');
      router.push('/login');
      router.refresh();
    } catch {
      toast.showToast(locale === 'th' ? 'เน€เธเธทเนเธญเธกเธ•เนเธญเนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน' : 'Network error. Please try again.', 'error');
      setLoading(false);
    }
  }

  const resendLabel =
    resendIn > 0
      ? (locale === 'th' ? 'เธชเนเธเนเธซเธกเนเนเธ ' : 'Resend in ') + String(resendIn) + 's'
      : locale === 'th'
        ? 'เธชเนเธ OTP เนเธซเธกเน'
        : 'Resend OTP';

  const canUseAdminQr = profileStatus === 'active' && ['approver', 'admin', 'super_admin'].includes(profileRole);

  const menuBtn = (key: 'name' | 'email' | 'password' | 'pin' | 'language' | 'logout', title: string, Icon: any) => (
    <button
      key={key}
      type='button'
      onClick={() => openSection(key)}
      className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:shadow-[0_12px_26px_rgba(37,99,235,0.12)]'
    >
      <span className='inline-flex items-center gap-3'>
        <span className='rounded-xl bg-slate-100 p-2.5 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700'>
          <Icon className='h-4 w-4' />
        </span>
        <span className='text-base font-semibold leading-6 text-slate-800'>{title}</span>
      </span>
      <ChevronRight className='h-4 w-4 text-slate-400' />
    </button>
  );

  const nameView = (
    <Card className='space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]'>
      <div className='space-y-1.5'>
        <p className='text-xs font-semibold text-slate-500'>{locale === 'th' ? 'เธเธทเนเธญเนเธเธฃเนเธเธฅเน' : 'Profile name'}</p>
        <Input value={fullName} placeholder={t('settings.fullNamePlaceholder')} onChange={(ev) => setFullName(ev.target.value)} className='h-11 rounded-xl bg-white' />
      </div>
      <div className='space-y-1.5'>
        <p className='text-xs font-semibold text-slate-500'>{locale === 'th' ? 'เธญเธตเน€เธกเธฅ' : 'Email'}</p>
        <Input value={profileEmail} readOnly className='h-11 rounded-xl bg-white text-slate-700' />
      </div>
      <div className='space-y-1.5'>
        <p className='text-xs font-semibold text-slate-500'>{locale === 'th' ? 'เธฃเธซเธฑเธชเธเนเธฒเธ' : 'Password'}</p>
        <Input value='xxxxx' readOnly className='h-11 rounded-xl bg-white text-slate-700 tracking-[0.2em]' />
      </div>
      <Button onClick={() => void updateProfile()} disabled={loading} className='h-11 rounded-xl'>
        {loading ? (
          <span className='inline-flex items-center gap-2'>
            <Spinner />
            {t('settings.saving')}
          </span>
        ) : (
          t('settings.updateName')
        )}
      </Button>
    </Card>
  );

  const emailStepOne = (
    <Card className='space-y-4 rounded-[24px] border-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700 p-5 text-white shadow-[0_18px_40px_rgba(30,64,175,0.35)]'>
      <p className='text-sm font-semibold tracking-wide text-blue-100'>{t('settings.sendEmailConfirm')}</p>
      <Input
        type='email'
        value={newEmail}
        placeholder={t('settings.newEmailPlaceholder')}
        onChange={(ev) => setNewEmail(ev.target.value)}
        className='h-12 rounded-2xl border-2 border-blue-300 bg-white text-slate-900 placeholder:text-slate-400'
      />
      <div className='grid grid-cols-2 gap-2'>
        <Button variant='secondary' className='h-12 rounded-2xl' onClick={() => goMenuRoot()} disabled={emailLoading}>
          {locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}
        </Button>
        <Button className='h-12 rounded-2xl bg-white text-blue-900 hover:bg-blue-50' onClick={() => void sendEmailOtp()} disabled={emailLoading || resendIn > 0}>
          {resendIn > 0 ? (locale === 'th' ? 'เธชเนเธเนเธซเธกเนเนเธ ' : 'Resend in ') + String(resendIn) + 's' : t('settings.requestEmailChange')}
        </Button>
      </div>
      <div className='rounded-xl border border-cyan-200/40 bg-cyan-300/20 px-3 py-2 text-xs font-medium text-cyan-100'>
        {locale === 'th' ? 'เธซเธฒเธเนเธ”เนเธฃเธฑเธ OTP เนเธฅเนเธง เนเธกเนเธ•เนเธญเธเธเธ”เธเธญเธเนเธณ เนเธฅเธฐเนเธเน OTP เธฅเนเธฒเธชเธธเธ”เนเธ”เนเธ—เธฑเธเธ—เธต' : 'If you already received OTP email, do not request again. Use latest OTP.'}
      </div>
      {showUseLatestOtp ? (
      <Button variant='secondary' className='h-11 rounded-xl border border-white/40 bg-white/15 text-white hover:bg-white/20' onClick={() => setEmailStep('enter_otp')} disabled={emailLoading}>
        {locale === 'th' ? 'เนเธเน OTP เธฅเนเธฒเธชเธธเธ”' : 'Use latest OTP'}
      </Button>
      ) : null}
    </Card>
  );

  const emailStepTwo = (
    <Card className='space-y-4 rounded-[24px] border-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700 p-5 text-white shadow-[0_18px_40px_rgba(30,64,175,0.35)]'>
      <p className='text-sm font-semibold tracking-wide text-blue-100'>OTP 6-digit</p>
      <OtpInput value={emailOtp} onChange={setEmailOtp} length={6} ariaLabel={t('otpInput.ariaLabel')} />
      <div className='rounded-xl border border-cyan-200/40 bg-cyan-300/20 px-3 py-2 text-xs font-medium text-cyan-100'>
        {emailAutoLoading
          ? locale === 'th'
            ? 'เธเธณเธฅเธฑเธเธขเธทเธเธขเธฑเธ OTP เนเธฅเธฐเธเธฑเธเธ—เธถเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธด...'
            : 'Verifying OTP and saving automatically...'
          : locale === 'th'
            ? 'เธเธฃเธญเธ OTP 6 เธซเธฅเธฑเธเนเธ”เนเธ—เธฑเธเธ—เธต เนเธกเนเธ•เธดเธ” rate limit เธเธญเธเธเธฒเธฃเธชเนเธเธญเธตเน€เธกเธฅ'
            : 'Enter 6-digit OTP now, even if resend is rate-limited.'}
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <Button variant='secondary' className='h-11 rounded-xl' onClick={() => { setEmailStep('enter_email'); setEmailOtp(''); setResendIn(0); }} disabled={emailAutoLoading}>
          {locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}
        </Button>
        <Button className='h-11 rounded-xl bg-white text-blue-900 hover:bg-blue-50' onClick={() => void sendEmailOtp()} disabled={emailLoading || resendIn > 0}>
          {resendLabel}
        </Button>
      </div>
    </Card>
  );

  const emailView = emailStep === 'enter_email' ? emailStepOne : emailStepTwo;

  const passwordView = (
    <Card className='space-y-3 rounded-[24px] p-4'>
      {passwordStep === 'enter_password' ? (
        <>
          <Input type='password' value={newPassword} placeholder={t('settings.newPasswordPlaceholder')} onChange={(ev) => setNewPassword(ev.target.value)} />
          <Button onClick={beginPasswordChange} disabled={loading || passwordPinLoading}>
            {locale === 'th' ? 'เธเธฑเธเธ—เธถเธ' : 'Save'}
          </Button>
        </>
      ) : (
        <>
          <p className='text-xs text-slate-500'>
            {locale === 'th'
              ? 'เธขเธทเธเธขเธฑเธ PIN เน€เธเธทเนเธญเธเธฑเธเธ—เธถเธเธฃเธซเธฑเธชเธเนเธฒเธเนเธซเธกเน เธฃเธฐเธเธเธเธฐเธเธฑเธเธ—เธถเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเน€เธกเธทเนเธญเธเธฃเธญเธเธเธฃเธ'
              : 'Enter PIN to confirm. Save runs automatically when complete.'}
          </p>
          <OtpInput value={passwordPin} onChange={setPasswordPin} length={6} ariaLabel={locale === 'th' ? 'เธเธฃเธญเธ PIN เธขเธทเธเธขเธฑเธ' : 'Enter confirm PIN'} />
          <Button variant='secondary' onClick={() => { setPasswordStep('enter_password'); setPasswordPin(''); }} disabled={passwordPinLoading}>
            {locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธ' : 'Back'}
          </Button>
        </>
      )}
    </Card>
  );

  const pinView = (
    <Card className='space-y-3 rounded-[24px] p-4'>
      <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
        <div className='mb-2 flex items-start gap-2'>
          <Shield className='mt-0.5 h-4 w-4 text-slate-600' />
          <div>
            <p className='text-sm font-semibold text-slate-800'>
              {locale === 'th' ? 'เน€เธเธดเธ”เธฃเธฑเธเธฉเธฒเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข PIN เธฅเนเธญเธเธซเธเนเธฒเธเธญ' : 'Enable PIN screen lock security'}
            </p>
            <p className='text-xs text-slate-500'>
              {locale === 'th'
                ? 'เธเธดเธ”เนเธ”เนเธซเธฒเธเนเธกเนเธ•เนเธญเธเธเธฒเธฃเนเธซเนเนเธญเธเน€เธ”เนเธเธฅเนเธญเธ PIN เธ—เธธเธเธเธฃเธฑเนเธ'
                : 'Turn off if you do not want app-level PIN lock prompt.'}
            </p>
          </div>
        </div>
        <div className='grid grid-cols-2 gap-2'>
          <Button
            variant={pinSessionEnabled ? 'default' : 'secondary'}
            className='h-10 rounded-xl'
            onClick={() => void updatePinSecurity(true)}
            disabled={pinSecuritySaving}
          >
            {locale === 'th' ? 'เน€เธเธดเธ”เนเธเนเธเธฒเธ' : 'Enabled'}
          </Button>
          <Button
            variant={!pinSessionEnabled ? 'default' : 'secondary'}
            className='h-10 rounded-xl'
            onClick={() => void updatePinSecurity(false)}
            disabled={pinSecuritySaving}
          >
            {locale === 'th' ? 'เธเธดเธ”เนเธเนเธเธฒเธ' : 'Disabled'}
          </Button>
        </div>
        <div className='mt-3 space-y-1.5'>
          <p className='text-xs font-semibold text-slate-600'>
            {locale === 'th' ? 'เธ•เธฑเนเธเน€เธงเธฅเธฒเธฅเนเธญเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเน€เธกเธทเนเธญเนเธกเนเธกเธตเธเธฒเธฃเนเธเนเธเธฒเธ' : 'Set auto-lock timeout after inactivity'}
          </p>
          <div className='grid grid-cols-3 gap-2'>
            {PIN_SESSION_TIMEOUT_OPTIONS_SEC.map((sec) => (
              <Button
                key={sec}
                variant={pinSessionTimeoutSec === sec ? 'default' : 'secondary'}
                className='h-9 rounded-xl text-xs'
                onClick={() => void updatePinSecurity(pinSessionEnabled, sec)}
                disabled={pinSecuritySaving}
              >
                {timeoutOptionLabel(sec)}
              </Button>
            ))}
          </div>
          <p className='text-[11px] text-slate-500'>
            {locale === 'th'
              ? 'เธฃเธฐเธเธเธเธฐเธเธฑเธเธเธฒเธฃเนเธ•เธฐ/เธเธฅเธดเธ/เธเธดเธกเธเน/เน€เธฅเธทเนเธญเธเธซเธเนเธฒเธเธญ เธซเธฒเธเนเธกเนเธกเธตเธเธฒเธฃเนเธเนเธเธฒเธเธเธฃเธเน€เธงเธฅเธฒเธ—เธตเนเธ•เธฑเนเธเนเธงเนเธเธฐเธฅเนเธญเธ PIN เธ—เธฑเธเธ—เธต'
              : 'The app tracks tap/click/type/scroll activity and locks with PIN immediately after selected idle time.'}
          </p>
        </div>
      </div>
      <Input type='password' inputMode='numeric' maxLength={6} value={currentPin} placeholder={t('settings.currentPinPlaceholder')} onChange={(ev) => setCurrentPin(digits(ev.target.value))} />
      <Input type='password' inputMode='numeric' maxLength={6} value={newPin} placeholder={t('settings.newPinPlaceholder')} onChange={(ev) => setNewPin(digits(ev.target.value))} />
      <Input type='password' inputMode='numeric' maxLength={6} value={confirmPin} placeholder={t('settings.confirmPinPlaceholder')} onChange={(ev) => setConfirmPin(digits(ev.target.value))} />
      <Button onClick={() => void updatePin()} disabled={loading}>{t('settings.setOrChangePin')}</Button>
    </Card>
  );

  const languageView = (
    <Card className='space-y-4 rounded-[24px] p-4'>
      <p className='text-sm text-slate-600'>
        {locale === 'th' ? 'เน€เธฅเธทเธญเธเธ เธฒเธฉเธฒเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเนเธเนเธเธฒเธเนเธเธฃเธฐเธเธ' : 'Choose your preferred app language.'}
      </p>
      <div className='grid grid-cols-2 gap-2'>
        <Button
          variant={locale === 'th' ? 'default' : 'secondary'}
          className={locale === 'th' ? 'h-11 rounded-xl' : 'h-11 rounded-xl'}
          onClick={() => setLocale('th')}
        >
          เนเธ—เธข
        </Button>
        <Button
          variant={locale === 'en' ? 'default' : 'secondary'}
          className={locale === 'en' ? 'h-11 rounded-xl' : 'h-11 rounded-xl'}
          onClick={() => setLocale('en')}
        >
          English
        </Button>
      </div>
    </Card>
  );

  const logoutView = (
    <Card className='space-y-3 rounded-[24px] p-4'>
      <p className='text-sm text-slate-600'>
        {locale === 'th' ? 'เธเธ”เธขเธทเธเธขเธฑเธเน€เธเธทเนเธญเธญเธญเธเธเธฒเธเธฃเธฐเธเธเนเธเธญเธธเธเธเธฃเธ“เนเธเธตเน' : 'Confirm to sign out from this device.'}
      </p>
      <Button variant='destructive' className='h-11 rounded-xl' onClick={() => void logout()} disabled={loading}>
        {loading ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธญเธญเธเธเธฒเธเธฃเธฐเธเธ...' : 'Signing out...') : (locale === 'th' ? 'เธขเธทเธเธขเธฑเธเธญเธญเธเธเธฒเธเธฃเธฐเธเธ' : 'Sign out')}
      </Button>
    </Card>
  );

  const activeTitle = active === 'name'
    ? t('settings.nameTitle')
    : active === 'email'
      ? t('settings.emailTitle')
      : active === 'password'
        ? t('settings.passwordTitle')
        : active === 'pin'
          ? t('settings.pinTitle')
          : active === 'language'
            ? (locale === 'th' ? 'เน€เธเธฅเธตเนเธขเธเธ เธฒเธฉเธฒ' : 'Change language')
            : locale === 'th'
              ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธ'
              : 'Sign out';

  const body = active === 'name'
    ? nameView
    : active === 'email'
      ? emailView
      : active === 'password'
        ? passwordView
        : active === 'pin'
          ? pinView
          : active === 'language'
            ? languageView
            : active === 'logout'
              ? logoutView
              : null;

  return (
    <section className='space-y-5 pb-24 pt-2'>
      {active ? null : (
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h1 className='text-3xl font-semibold leading-tight text-slate-900'>{t('settings.title')}</h1>
            <p className='text-sm leading-6 text-slate-500'>{locale === 'th' ? 'เน€เธฅเธทเธญเธเน€เธกเธเธนเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธเธฃเธฑเธเนเธ•เนเธเนเธเธฃเนเธเธฅเนเธเธญเธเธเธธเธ“' : 'Select a menu to update your profile settings.'}</p>
          </div>
          {canUseAdminQr ? (
            <button
              type='button'
              onClick={() => router.push('/settings/admin-qr-login')}
              className='inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-[0_8px_18px_rgba(37,99,235,0.16)] transition hover:bg-blue-100'
              aria-label={locale === 'th' ? 'สแกน QR สำหรับแอดมินล็อกอิน' : 'Scan QR for admin login'}
              title={locale === 'th' ? 'สแกน QR Admin Login' : 'Scan Admin Login QR'}
            >
              <QrCode className='h-4 w-4' />
            </button>
          ) : null}
        </div>
      )}
      <div className={active ? 'hidden' : 'grid gap-3.5'}>
        {menuBtn('name', t('settings.nameTitle'), UserRound)}
        {menuBtn('email', t('settings.emailTitle'), Mail)}
        {menuBtn('password', t('settings.passwordTitle'), Lock)}
        {menuBtn('pin', t('settings.pinTitle'), KeyRound)}
        {menuBtn('language', locale === 'th' ? 'เน€เธเธฅเธตเนเธขเธเธ เธฒเธฉเธฒ' : 'Change language', Languages)}
        <button
          type='button'
          onClick={() => router.push('/settings/notifications')}
          className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:shadow-[0_12px_26px_rgba(37,99,235,0.12)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl bg-slate-100 p-2.5 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700'>
              <Bell className='h-4 w-4' />
            </span>
            <span className='text-base font-semibold leading-6 text-slate-800'>
              {locale === 'th' ? 'เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ' : 'Notifications'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-400' />
        </button>
        <button
          type='button'
          onClick={() => router.push('/help-center')}
          className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:shadow-[0_12px_26px_rgba(37,99,235,0.12)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl bg-slate-100 p-2.5 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700'>
              <LifeBuoy className='h-4 w-4' />
            </span>
            <span className='text-base font-semibold leading-6 text-slate-800'>
              {locale === 'th' ? 'เธจเธนเธเธขเนเธเนเธงเธขเน€เธซเธฅเธทเธญ' : 'Help center'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-400' />
        </button>
        <button
          type='button'
          onClick={() => router.push('/settings/sync')}
          className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:shadow-[0_12px_26px_rgba(37,99,235,0.12)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl bg-slate-100 p-2.5 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700'>
              <RefreshCw className='h-4 w-4' />
            </span>
            <span className='text-base font-semibold leading-6 text-slate-800'>
              {locale === 'th' ? 'เธจเธนเธเธขเนเธเธดเธเธเนเธญเธญเธเนเธฅเธเน' : 'Offline Sync Center'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-400' />
        </button>
        <TopQuickActions variant='settings-menu' showSecondaryActions={false} />
        {menuBtn('logout', locale === 'th' ? 'เธญเธญเธเธเธฒเธเธฃเธฐเธเธ' : 'Sign out', LogOut)}
      </div>

      {body && (
        <div className='mt-2 space-y-3'>
          <div className='mx-auto w-full max-w-[540px] rounded-[30px] bg-white px-5 pt-5 pb-8 shadow-[0_10px_35px_rgba(15,23,42,0.16)]'>
 <div className='mb-5 flex items-center gap-2'>
 <button
 type='button'
 className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600'
 onClick={goMenuRoot}
 aria-label={locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธ' : 'Back'}
 >
 <ChevronLeft className='h-4 w-4' />
 </button>
 <h2 className='text-xl font-semibold leading-tight text-slate-900'>
 {activeTitle}
 </h2>
 </div>
            {body}
          </div>
        </div>
      )}
    </section>
  );
}



