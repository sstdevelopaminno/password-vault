'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Languages,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  Moon,
  QrCode,
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
import { useI18n } from '@/i18n/provider';
import { isAdminFeaturesEnabledClient } from '@/lib/admin-feature-flags';
import { useTheme, type ThemeMode } from '@/lib/theme';

type SettingsSection = '' | 'name' | 'email' | 'password' | 'language' | 'theme' | 'logout';

const SETTINGS_SECTION_QUERY = 'section';

function parseSettingsSection(raw: string | null): SettingsSection {
  if (raw === 'name' || raw === 'email' || raw === 'password' || raw === 'language' || raw === 'theme' || raw === 'logout') {
    return raw;
  }
  return '';
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
  const [profileRole, setProfileRole] = useState('pending');
  const [profileStatus, setProfileStatus] = useState('pending_approval');

  const [emailStep, setEmailStep] = useState<'enter_email' | 'enter_otp'>('enter_email');
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [showUseLatestOtp, setShowUseLatestOtp] = useState(false);

  const [newPassword, setNewPassword] = useState('');

  const loadProfile = useCallback(async () => {
    const response = await fetch('/api/profile/me', { method: 'GET' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return;

    setFullName(String(body?.fullName ?? ''));
    setProfileEmail(String(body?.email ?? ''));
    setProfileRole(String(body?.role ?? 'pending'));
    setProfileStatus(String(body?.status ?? 'pending_approval'));
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

  const menuBtn = (
    key: Exclude<SettingsSection, ''>,
    title: string,
    Icon: LucideIcon,
  ) => (
    <button
      key={key}
      type='button'
      onClick={() => openSection(key)}
      className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3.5 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
    >
      <span className='inline-flex items-center gap-3'>
        <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 text-sky-300 group-hover:text-cyan-200'>
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
          : active === 'language'
            ? languageView
            : active === 'theme'
              ? themeView
            : active === 'logout'
              ? logoutView
              : null;

  return (
    <section className='space-y-5 pb-24 pt-2'>
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

      <div className={active ? 'hidden' : 'grid gap-3.5'}>
        {menuBtn('name', t('settings.nameTitle'), UserRound)}
        {menuBtn('email', t('settings.emailTitle'), Mail)}
        {menuBtn('password', t('settings.passwordTitle'), Lock)}
        {menuBtn('language', locale === 'th' ? 'เปลี่ยนภาษา' : 'Change language', Languages)}
        {menuBtn('theme', locale === 'th' ? 'ธีมแอป' : 'App theme', SunMoon)}

        <button
          type='button'
          onClick={() => router.push('/settings/notifications')}
          className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3.5 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 text-sky-300 group-hover:text-cyan-200'>
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
          onClick={() => router.push('/help-center')}
          className='group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-4 py-3.5 text-left shadow-[var(--glow-soft)] transition hover:border-[var(--border-strong)]'
        >
          <span className='inline-flex items-center gap-3'>
            <span className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 text-sky-300 group-hover:text-cyan-200'>
              <LifeBuoy className='h-4 w-4' />
            </span>
            <span className='text-app-h3 font-semibold text-slate-100'>
              {locale === 'th' ? 'ศูนย์ช่วยเหลือ' : 'Help center'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-300' />
        </button>
        <TopQuickActions variant='settings-menu' showSecondaryActions={false} />
        {menuBtn('logout', locale === 'th' ? 'ออกจากระบบ' : 'Sign out', LogOut)}
      </div>

      {body ? (
        <div className='mt-2 space-y-3'>
          <div className='mx-auto w-full max-w-[540px] rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-1)] px-5 pb-8 pt-5 shadow-[var(--glow-soft)]'>
            <div className='mb-5 flex items-center gap-2'>
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
    </section>
  );
}

