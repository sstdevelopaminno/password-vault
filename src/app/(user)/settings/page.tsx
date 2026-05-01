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
import { useTheme, type ThemeMode } from '@/lib/theme';

type SettingsSection = '' | 'name' | 'email' | 'password' | 'pin' | 'language' | 'theme' | 'logout';

const SETTINGS_SECTION_QUERY = 'section';

function parseSettingsSection(raw: string | null): SettingsSection {
  if (raw === 'name' || raw === 'email' || raw === 'password' || raw === 'pin' || raw === 'language' || raw === 'theme' || raw === 'logout') {
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
  if (text.includes('rate limit')) {
    return locale === 'th' ? 'ขอ OTP ถี่เกินไป กรุณารอสักครู่' : 'OTP is rate limited. Please wait.';
  }
  return String(message ?? t('settings.updateFailed' as T));
}

export default function SettingsPage() {
  const toast = useToast();
  const { t, locale, setLocale } = useI18n();
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3 | 4>(1);
  const [deletePinModalOpen, setDeletePinModalOpen] = useState(false);
  const [deletePinAssertionToken, setDeletePinAssertionToken] = useState<string | null>(null);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteOtpSending, setDeleteOtpSending] = useState(false);
  const [deleteOtpCooldown, setDeleteOtpCooldown] = useState(0);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const deleteConfirmSuffix = 'ยืนยันการลบข้อมูลและบัญชีนี้ อย่างถาวร';
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
        locale === 'th' ? 'ชื่อโปรไฟล์ต้องมีอย่างน้อย 2 ตัวอักษร' : 'Profile name is too short.',
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
      toast.showToast(locale === 'th' ? 'อีเมลไม่ถูกต้อง' : 'Invalid email', 'error');
      return;
    }

    if (resendIn > 0) {
      toast.showToast(
        locale === 'th'
          ? 'กรุณารอก่อนขอ OTP ใหม่ และใช้ OTP ล่าสุดในอีเมล'
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
          ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'
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
      toast.showToast(locale === 'th' ? 'กรุณากรอก PIN ใหม่และยืนยัน PIN ให้ครบ 6 หลัก' : 'Please enter new PIN and confirmation (6 digits).', 'error');
      return;
    }
    if (nextPin !== nextConfirm) {
      toast.showToast(locale === 'th' ? 'PIN ใหม่และยืนยัน PIN ไม่ตรงกัน' : 'PIN confirmation does not match.', 'error');
      return;
    }
    if (hasExistingPin && current.length !== 6) {
      toast.showToast(locale === 'th' ? 'กรุณากรอก PIN ปัจจุบัน 6 หลัก' : 'Current PIN is required (6 digits).', 'error');
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
      toast.showToast(mapError(body?.error ?? (locale === 'th' ? 'อัปเดต PIN ไม่สำเร็จ' : 'Failed to update PIN'), t, locale), 'error');
      return;
    }

    toast.showToast(locale === 'th' ? 'บันทึก PIN สำเร็จ' : 'PIN updated successfully', 'success');
    setHasExistingPin(true);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    goMenuRoot();
  }, [confirmPin, currentPin, goMenuRoot, hasExistingPin, locale, newPin, pinSaving, t, toast]);

  const openDeleteModal = useCallback(() => {
    if (!profileUserId) {
      toast.showToast(
        locale === 'th' ? 'ไม่สามารถเริ่มขั้นตอนลบบัญชีได้ กรุณารีเฟรชหน้าอีกครั้ง' : 'Unable to start delete flow. Please refresh.',
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
      locale === 'th' ? 'ส่ง OTP ไปที่อีเมลของคุณแล้ว' : 'OTP sent to your email.',
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
      toast.showToast(mapError(body?.error ?? 'Delete account failed', t, locale), 'error');
      if (response.status === 400 && typeof body?.expectedPhrase === 'string') {
        setDeleteConfirmationText(String(body.expectedPhrase));
      }
      return;
    }

    toast.showToast(
      locale === 'th' ? 'คำขอลบบัญชีถูกบันทึกแล้ว ระบบออกจากระบบให้อัตโนมัติ' : 'Deletion request saved. You have been signed out.',
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
            body?.error ?? (locale === 'th' ? 'ออกจากระบบไม่สำเร็จ' : 'Logout failed'),
            t,
            locale,
          ),
          'error',
        );
        setLoading(false);
        return;
      }

      toast.showToast(locale === 'th' ? 'ออกจากระบบแล้ว' : 'Signed out', 'success');
      router.push('/login');
      router.refresh();
    } catch {
      toast.showToast(
        locale === 'th' ? 'เครือข่ายมีปัญหา กรุณาลองใหม่' : 'Network error. Please try again.',
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
      ? `${locale === 'th' ? 'ส่งใหม่ใน' : 'Resend in'} ${resendIn}s`
      : locale === 'th'
        ? 'ส่ง OTP ใหม่'
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
          {locale === 'th' ? 'ชื่อโปรไฟล์' : 'Profile name'}
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
          {locale === 'th' ? 'รหัสผ่าน' : 'Password'}
        </p>
        <Input value='••••••••' readOnly className='h-10 rounded-xl bg-[var(--surface-1)] text-slate-200 tracking-[0.2em]' />
      </div>
      <Button onClick={() => void updateProfile()} disabled={loading} className='h-10 rounded-xl'>
        {loading ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : t('settings.updateName')}
      </Button>
      <div className='rounded-2xl border border-rose-300/35 bg-rose-500/10 p-3'>
        <p className='text-app-caption text-rose-100'>
          {locale === 'th'
            ? 'หากต้องการลบบัญชีและข้อมูลทั้งหมดของคุณ สามารถดำเนินการได้จากปุ่มด้านล่าง'
            : 'If you want to delete your account and all data, continue from the button below.'}
        </p>
        <Button
          type='button'
          variant='destructive'
          className='mt-3 h-10 w-full rounded-xl'
          onClick={openDeleteModal}
        >
          <Trash2 className='mr-2 h-4 w-4' />
          {locale === 'th' ? 'ลบบัญชีและข้อมูลทั้งหมด' : 'Delete account and all data'}
        </Button>
      </div>
    </Card>
  );

  const emailStepOne = (
    <Card className='space-y-4 rounded-[24px] border-0 bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700 p-5 text-white shadow-[0_18px_40px_rgba(30,64,175,0.35)]'>
      <div>
        <p className='text-app-body font-semibold text-blue-100'>
          {locale === 'th' ? 'เปลี่ยนอีเมลบัญชี' : 'Change account email'}
        </p>
        <p className='mt-1 text-app-caption text-blue-100/90'>
          {locale === 'th'
            ? 'กรอกอีเมลใหม่ จากนั้นระบบจะส่ง OTP ยืนยัน'
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
          {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
        </Button>
        <Button
          className='h-10 rounded-2xl bg-white text-blue-900 hover:bg-blue-50'
          onClick={() => void sendEmailOtp()}
          disabled={emailLoading || resendIn > 0}
        >
          {resendIn > 0 ? `${locale === 'th' ? 'ส่งใหม่ใน' : 'Resend in'} ${resendIn}s` : t('settings.requestEmailChange')}
        </Button>
      </div>
      <div className='rounded-xl border border-cyan-200/40 bg-cyan-300/20 px-3 py-2 text-app-caption font-medium text-cyan-100'>
        {locale === 'th'
          ? 'หากได้รับ OTP แล้ว ไม่ต้องกดขอซ้ำ ให้ใช้ OTP ล่าสุดในอีเมล'
          : 'If OTP already arrived, do not request again. Use the latest OTP.'}
      </div>
      {showUseLatestOtp ? (
        <Button
          variant='secondary'
          className='h-10 rounded-xl border border-white/40 bg-white/15 text-white hover:bg-white/20'
          onClick={() => setEmailStep('enter_otp')}
          disabled={emailLoading}
        >
          {locale === 'th' ? 'ใช้ OTP ล่าสุด' : 'Use latest OTP'}
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
            ? 'กำลังยืนยัน OTP และบันทึกอัตโนมัติ...'
            : 'Verifying OTP and saving automatically...'
          : locale === 'th'
            ? 'กรอก OTP 6 หลัก ระบบจะยืนยันให้อัตโนมัติ'
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
          {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
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
            ? 'กำลังบันทึก...'
            : 'Saving...'
          : t('settings.updatePassword')}
      </Button>
    </Card>
  );

  const pinView = (
    <Card className='space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      {hasExistingPin ? (
        <Input
          type='password'
          inputMode='numeric'
          maxLength={6}
          value={currentPin}
          placeholder={locale === 'th' ? 'PIN ปัจจุบัน 6 หลัก' : 'Current 6-digit PIN'}
          onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      ) : null}
      <Input
        type='password'
        inputMode='numeric'
        maxLength={6}
        value={newPin}
        placeholder={locale === 'th' ? 'PIN ใหม่ 6 หลัก' : 'New 6-digit PIN'}
        onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      <Input
        type='password'
        inputMode='numeric'
        maxLength={6}
        value={confirmPin}
        placeholder={locale === 'th' ? 'ยืนยัน PIN 6 หลัก' : 'Confirm 6-digit PIN'}
        onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      <Button onClick={() => void updatePin()} disabled={pinSaving} className='h-10 rounded-xl'>
        {pinSaving
          ? locale === 'th'
            ? 'กำลังบันทึก...'
            : 'Saving...'
          : locale === 'th'
            ? hasExistingPin
              ? 'เปลี่ยน PIN'
              : 'ตั้งค่า PIN'
            : hasExistingPin
              ? 'Change PIN'
              : 'Set PIN'}
      </Button>
    </Card>
  );

  const languageView = (
    <Card className='space-y-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th' ? 'เลือกภาษาที่ต้องการใช้งาน' : 'Choose your preferred app language.'}
      </p>
      <div className='grid grid-cols-2 gap-2'>
        <Button
          variant={locale === 'th' ? 'default' : 'secondary'}
          className='h-10 rounded-xl'
          onClick={() => setLocale('th')}
        >
          ไทย
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
          {locale === 'th' ? 'กำลังใช้' : 'Active'}
        </span>
      ) : null}
    </button>
  );

  const themeView = (
    <Card className='space-y-4 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th'
          ? `เลือกธีมทั้งระบบ (ตอนนี้แสดงผล: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`
          : `Choose app-wide theme (currently showing: ${resolvedTheme})`}
      </p>
      <div className='grid gap-2'>
        {themeOption('auto', locale === 'th' ? 'อัตโนมัติ' : 'Auto', SunMoon)}
        {themeOption('light', locale === 'th' ? 'สว่าง' : 'Light', Sun)}
        {themeOption('dark', locale === 'th' ? 'เข้ม' : 'Dark', Moon)}
      </div>
    </Card>
  );

  const logoutView = (
    <Card className='space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4'>
      <p className='text-app-body text-slate-300'>
        {locale === 'th'
          ? 'ยืนยันการออกจากระบบบนอุปกรณ์นี้'
          : 'Confirm to sign out from this device.'}
      </p>
      <Button variant='destructive' className='h-10 rounded-xl' onClick={() => void logout()} disabled={loading}>
        {loading ? (locale === 'th' ? 'กำลังออกจากระบบ...' : 'Signing out...') : (locale === 'th' ? 'ออกจากระบบ' : 'Sign out')}
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
              ? 'PIN ความปลอดภัย'
              : 'PIN Security'
          : active === 'language'
            ? locale === 'th'
              ? 'เปลี่ยนภาษา'
              : 'Change language'
            : active === 'theme'
              ? locale === 'th'
                ? 'ธีมแอป'
                : 'App theme'
            : locale === 'th'
              ? 'ออกจากระบบ'
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
              {locale === 'th' ? 'เลือกเมนูที่ต้องการปรับแต่งโปรไฟล์ของคุณ' : 'Select a menu to update your profile settings.'}
            </p>
          </div>
          {canUseAdminQr ? (
            <button
              type='button'
              onClick={() => router.push('/settings/admin-qr-login')}
              className='inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-[0_8px_18px_rgba(37,99,235,0.16)] transition hover:bg-blue-100'
              aria-label={locale === 'th' ? 'สแกน QR สำหรับ Admin Login' : 'Scan QR for admin login'}
              title={locale === 'th' ? 'สแกน QR สำหรับ Admin Login' : 'Scan Admin Login QR'}
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
        {menuBtn('pin', locale === 'th' ? 'PIN ความปลอดภัย' : 'PIN Security', KeyRound)}
        {menuBtn('language', locale === 'th' ? 'เปลี่ยนภาษา' : 'Change language', Languages)}
        {menuBtn('theme', locale === 'th' ? 'ธีมแอป' : 'App theme', SunMoon)}

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
              {locale === 'th' ? 'การแจ้งเตือน' : 'Notifications'}
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
              {locale === 'th' ? 'ล็อคหน้าจอ' : 'Lock screen'}
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
              {locale === 'th' ? 'ศูนย์ช่วยเหลือ' : 'Help center'}
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
              {locale === 'th' ? 'เครื่องพิมพ์ Bluetooth' : 'Bluetooth Printer'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-300' />
        </button>
        <TopQuickActions variant='settings-menu' showSecondaryActions={false} />
        {menuBtn('logout', locale === 'th' ? 'ออกจากระบบ' : 'Sign out', LogOut)}
      </div>

      {body ? (
        <div className='mt-1 space-y-3'>
          <div className='mx-auto w-full max-w-[520px] rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 pb-6 pt-4 shadow-[var(--glow-soft)]'>
            <div className='mb-4 flex items-center gap-2'>
              <button
                type='button'
                className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-200'
                onClick={goMenuRoot}
                aria-label={locale === 'th' ? 'ย้อนกลับ' : 'Back'}
              >
                <ChevronLeft className='h-4 w-4' />
              </button>
              <h2 className='text-app-h3 font-semibold text-slate-100'>{activeTitle}</h2>
            </div>
            {body}
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
                  {locale === 'th' ? 'ยืนยันการลบบัญชีและข้อมูลทั้งหมด' : 'Confirm account and data deletion'}
                </h3>
                <p className='text-app-caption text-slate-300'>
                  {locale === 'th'
                    ? `ขั้นตอน ${deleteStep === 4 ? 'ยืนยันสุดท้าย' : `${deleteStep}/3`}`
                    : deleteStep === 4
                      ? 'Final confirmation'
                      : `Step ${deleteStep}/3`}
                </p>
              </div>

              {deleteStep === 1 ? (
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <p className='form-label text-slate-300'>{locale === 'th' ? '1) ยืนยัน PIN' : '1) Verify PIN'}</p>
                    <Button
                      type='button'
                      className='h-10 w-full rounded-xl'
                      variant={deletePinAssertionToken ? 'secondary' : 'default'}
                      onClick={() => setDeletePinModalOpen(true)}
                    >
                      {deletePinAssertionToken
                        ? locale === 'th'
                          ? 'ยืนยัน PIN แล้ว'
                          : 'PIN verified'
                        : locale === 'th'
                          ? 'กดเพื่อยืนยัน PIN'
                          : 'Verify PIN'}
                    </Button>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={closeDeleteModal}>
                      {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      disabled={!canMoveDeleteStep2}
                      onClick={() => setDeleteStep(2)}
                    >
                      {locale === 'th' ? 'ขั้นตอนถัดไป' : 'Next step'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {deleteStep === 2 ? (
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <p className='form-label text-slate-300'>{locale === 'th' ? '2) กรอก OTP จากอีเมล' : '2) Enter OTP from email'}</p>
                    <OtpInput value={deleteOtp} onChange={setDeleteOtp} length={6} ariaLabel='Delete account OTP input' />
                    <Button
                      type='button'
                      variant='secondary'
                      className='h-10 w-full rounded-xl'
                      onClick={() => void sendDeleteOtp()}
                      disabled={deleteOtpSending || deleteOtpCooldown > 0}
                    >
                      {deleteOtpCooldown > 0
                        ? `${locale === 'th' ? 'ส่งใหม่ใน' : 'Resend in'} ${deleteOtpCooldown}s`
                        : locale === 'th'
                          ? 'ส่ง OTP ไปยังอีเมล'
                          : 'Send OTP to email'}
                    </Button>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => setDeleteStep(1)}>
                      {locale === 'th' ? 'ย้อนกลับ' : 'Back'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      disabled={!canMoveDeleteStep3}
                      onClick={() => setDeleteStep(3)}
                    >
                      {locale === 'th' ? 'ขั้นตอนถัดไป' : 'Next step'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {deleteStep === 3 ? (
                <div className='space-y-4'>
                  <div className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3'>
                    <p className='text-app-caption text-slate-300'>
                      {locale === 'th' ? 'ข้อความที่ต้องพิมพ์ให้ตรง:' : 'Required confirmation text:'}
                    </p>
                    <p className='mt-1 break-words text-app-body font-semibold text-slate-100'>{deleteExpectedText}</p>
                  </div>
                  <div className='space-y-2'>
                    <p className='form-label text-slate-300'>{locale === 'th' ? '3) พิมพ์ข้อความยืนยัน' : '3) Type confirmation text'}</p>
                    <Input
                      value={deleteConfirmationText}
                      onChange={(event) => setDeleteConfirmationText(event.target.value)}
                      placeholder={deleteExpectedText}
                      className='h-10 rounded-xl bg-[var(--surface-2)] text-slate-100'
                    />
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => setDeleteStep(2)}>
                      {locale === 'th' ? 'ย้อนกลับ' : 'Back'}
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      className='h-10 rounded-xl'
                      disabled={!canMoveDeleteStep4}
                      onClick={() => setDeleteStep(4)}
                    >
                      {locale === 'th' ? 'ขั้นตอนถัดไป' : 'Next step'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {deleteStep === 4 ? (
                <div className='space-y-4'>
                  <div className='space-y-3 text-app-caption text-slate-200'>
                    <p>
                      คุณแน่ใจ ว่าจะทำการลบบัญชี นี้ และ ข้อมูลของคุณจะถูกลบ ไปด้วย หากต้องการลบ ให้ คัดลอกข้อมูลของคุณไว้
                      เพื่อไม่ให้เกิดความเสียหายขึ้น ต่อคุณเอง
                    </p>
                    <p>
                      หากยืนยันรอบสุดท้ายนี้ แล้ว ระบบ จะยังเก็บข้อมูลของคุณ ไว้ 7 วัน เพื่อที่สามารถนำมากู้บัญชี และข้อมูลของคุณจะยังคงกลับมาเหมือนเดิม
                      แต่ หากเลย 7 วันไปแล้ว คุณจะไม่สามารถกู้บัญชี ของคุณได้ อีก
                    </p>
                    <p>
                      แต่คุณยังมีโอกาส อีกครั้ง หากต้องการจะใช้งานบัญชี ของคุณต่อ โดยติดต่อทีมงานซับพอร์ตได้ ภายใน 30 วัน หลังจากที่
                      กดยืนยันรอบสุดท้าย ข้อมูลของคุณยังคงอยู่ต่ออีก 30 วัน หากเลย 30 วันแล้วคุณไม่ติดต่อมาทางเรา ข้อมูลจะถูกลบอย่างเป็นทางการและถาวร
                      และจะไม่สามารถกู้ได้อีกเลย
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
                      {locale === 'th' ? 'ย้อนกลับ' : 'Back'}
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
                          ? 'กำลังยืนยัน...'
                          : 'Confirming...'
                        : locale === 'th'
                          ? 'ยืนยันสุดท้าย'
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
          actionLabel={locale === 'th' ? 'ลบบัญชีและข้อมูลทั้งหมด' : 'delete your account and all data'}
          targetItemId={profileUserId || undefined}
          onClose={() => setDeletePinModalOpen(false)}
          onVerified={(assertionToken) => {
            setDeletePinAssertionToken(assertionToken);
            setDeletePinModalOpen(false);
            setDeleteStep(2);
            toast.showToast(locale === 'th' ? 'ยืนยัน PIN สำเร็จ' : 'PIN verified.', 'success');
          }}
        />
      ) : null}
    </section>
  );
}
