'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronRight, KeyRound, Languages, Lock, LogOut, Mail, UserRound, X } from 'lucide-react';
import { OtpInput } from '@/components/auth/otp-input';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

function digits(value: string) {
  return String(value).replace(/\D/g, '').slice(0, 6);
}

function mapError(message: unknown, t: (key: any) => string, locale: 'th' | 'en') {
  const text = String(message ?? '').toLowerCase();
  if (text.includes('token') || text.includes('invalid otp')) return t('verifyOtp.invalid');
  if (text.includes('duplicate key value') && text.includes('profiles_email_key')) {
    return locale === 'th'
      ? 'พบข้อมูลบัญชีซ้ำ ระบบกำลังเชื่อมบัญชีเดิมให้อัตโนมัติ กรุณาลองอีกครั้ง'
      : 'Duplicate profile detected. Please retry once while the system reconciles your account.';
  }
  if (text.includes('rate limit')) {
    return locale === 'th'
      ? 'OTP ถูกจำกัดความถี่ กรุณารอสักครู่และใช้ OTP ล่าสุดในอีเมล'
      : 'OTP is rate limited. Please wait and use the latest OTP from email.';
  }
  return String(message ?? 'Unknown error');
}

export default function SettingsPage() {
  const toast = useToast();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  const [active, setActive] = useState('' as '' | 'name' | 'email' | 'password' | 'pin' | 'language' | 'logout');
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');

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
      toast.showToast(locale === 'th' ? 'ชื่อโปรไฟล์สั้นเกินไป' : 'Profile name is too short', 'error');
      return;
    }

    setLoading(true);
    const body = await apiCall('/api/profile/update', 'PATCH', { purpose: 'change_profile', fullName: name }, t('settings.updateFailed'));
    setLoading(false);
    if (!body) return;

    toast.showToast(String(body?.message ?? t('settings.profileUpdated')), 'success');
    setActive('');
    void loadProfile();
  }

  async function sendEmailOtp() {
    const email = String(newEmail).trim().toLowerCase();
    if (!email.includes('@')) {
      toast.showToast(locale === 'th' ? 'กรุณากรอกอีเมลให้ถูกต้อง' : 'Invalid email', 'error');
      return;
    }

    if (resendIn > 0) {
      toast.showToast(
        locale === 'th'
          ? 'กรุณารอก่อนขอรหัสใหม่ และใช้ OTP ล่าสุดจากอีเมลได้ทันที'
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
    setActive('');
    setEmailStep('enter_email');
    setEmailOtp('');
    setResendIn(0);
    void loadProfile();
  }

  function beginPasswordChange() {
    if (newPassword.length < 8) {
      toast.showToast(locale === 'th' ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' : 'Password must be at least 8 characters', 'error');
      return;
    }
    setPasswordStep('enter_pin');
  }

  async function updatePassword() {
    if (newPassword.length < 8) {
      toast.showToast(locale === 'th' ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' : 'Password must be at least 8 characters', 'error');
      return;
    }
    if (passwordPin.length !== 6) {
      toast.showToast(locale === 'th' ? 'กรุณากรอก PIN 6 หลักเพื่อยืนยัน' : 'Please enter 6-digit PIN', 'error');
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
    setActive('');
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
    setActive('');
  }

  async function logout() {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.showToast(mapError(body?.error ?? (locale === 'th' ? 'ออกจากระบบไม่สำเร็จ' : 'Logout failed'), t, locale), 'error');
        setLoading(false);
        return;
      }

      toast.showToast(locale === 'th' ? 'ออกจากระบบแล้ว' : 'Signed out', 'success');
      router.push('/login');
      router.refresh();
    } catch {
      toast.showToast(locale === 'th' ? 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' : 'Network error. Please try again.', 'error');
      setLoading(false);
    }
  }

  const resendLabel =
    resendIn > 0
      ? (locale === 'th' ? 'ส่งใหม่ใน ' : 'Resend in ') + String(resendIn) + 's'
      : locale === 'th'
        ? 'ส่ง OTP ใหม่'
        : 'Resend OTP';

  const menuBtn = (key: 'name' | 'email' | 'password' | 'pin' | 'language' | 'logout', title: string, Icon: any) => (
    <button
      key={key}
      type='button'
      onClick={() => setActive(key)}
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
        <p className='text-xs font-semibold text-slate-500'>{locale === 'th' ? 'ชื่อโปรไฟล์' : 'Profile name'}</p>
        <Input value={fullName} placeholder={t('settings.fullNamePlaceholder')} onChange={(ev) => setFullName(ev.target.value)} className='h-11 rounded-xl bg-white' />
      </div>
      <div className='space-y-1.5'>
        <p className='text-xs font-semibold text-slate-500'>{locale === 'th' ? 'อีเมล' : 'Email'}</p>
        <Input value={profileEmail} readOnly className='h-11 rounded-xl bg-white text-slate-700' />
      </div>
      <div className='space-y-1.5'>
        <p className='text-xs font-semibold text-slate-500'>{locale === 'th' ? 'รหัสผ่าน' : 'Password'}</p>
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
        <Button variant='secondary' className='h-12 rounded-2xl' onClick={() => setActive('')} disabled={emailLoading}>
          {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
        </Button>
        <Button className='h-12 rounded-2xl bg-white text-blue-900 hover:bg-blue-50' onClick={() => void sendEmailOtp()} disabled={emailLoading || resendIn > 0}>
          {resendIn > 0 ? (locale === 'th' ? 'ส่งใหม่ใน ' : 'Resend in ') + String(resendIn) + 's' : t('settings.requestEmailChange')}
        </Button>
      </div>
      <div className='rounded-xl border border-cyan-200/40 bg-cyan-300/20 px-3 py-2 text-xs font-medium text-cyan-100'>
        {locale === 'th' ? 'หากได้รับ OTP แล้ว ไม่ต้องกดขอซ้ำ และใช้ OTP ล่าสุดได้ทันที' : 'If you already received OTP email, do not request again. Use latest OTP.'}
      </div>
      {showUseLatestOtp ? (
      <Button variant='secondary' className='h-11 rounded-xl border border-white/40 bg-white/15 text-white hover:bg-white/20' onClick={() => setEmailStep('enter_otp')} disabled={emailLoading}>
        {locale === 'th' ? 'ใช้ OTP ล่าสุด' : 'Use latest OTP'}
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
            ? 'กำลังยืนยัน OTP และบันทึกอัตโนมัติ...'
            : 'Verifying OTP and saving automatically...'
          : locale === 'th'
            ? 'กรอก OTP 6 หลักได้ทันที แม้ติด rate limit ของการส่งอีเมล'
            : 'Enter 6-digit OTP now, even if resend is rate-limited.'}
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <Button variant='secondary' className='h-11 rounded-xl' onClick={() => { setEmailStep('enter_email'); setEmailOtp(''); setResendIn(0); }} disabled={emailAutoLoading}>
          {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
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
            {locale === 'th' ? 'บันทึก' : 'Save'}
          </Button>
        </>
      ) : (
        <>
          <p className='text-xs text-slate-500'>
            {locale === 'th'
              ? 'ยืนยัน PIN เพื่อบันทึกรหัสผ่านใหม่ ระบบจะบันทึกอัตโนมัติเมื่อกรอกครบ'
              : 'Enter PIN to confirm. Save runs automatically when complete.'}
          </p>
          <OtpInput value={passwordPin} onChange={setPasswordPin} length={6} ariaLabel={locale === 'th' ? 'กรอก PIN ยืนยัน' : 'Enter confirm PIN'} />
          <Button variant='secondary' onClick={() => { setPasswordStep('enter_password'); setPasswordPin(''); }} disabled={passwordPinLoading}>
            {locale === 'th' ? 'ย้อนกลับ' : 'Back'}
          </Button>
        </>
      )}
    </Card>
  );

  const pinView = (
    <Card className='space-y-3 rounded-[24px] p-4'>
      <Input type='password' inputMode='numeric' maxLength={6} value={currentPin} placeholder={t('settings.currentPinPlaceholder')} onChange={(ev) => setCurrentPin(digits(ev.target.value))} />
      <Input type='password' inputMode='numeric' maxLength={6} value={newPin} placeholder={t('settings.newPinPlaceholder')} onChange={(ev) => setNewPin(digits(ev.target.value))} />
      <Input type='password' inputMode='numeric' maxLength={6} value={confirmPin} placeholder={t('settings.confirmPinPlaceholder')} onChange={(ev) => setConfirmPin(digits(ev.target.value))} />
      <Button onClick={() => void updatePin()} disabled={loading}>{t('settings.setOrChangePin')}</Button>
    </Card>
  );

  const languageView = (
    <Card className='space-y-4 rounded-[24px] p-4'>
      <p className='text-sm text-slate-600'>
        {locale === 'th' ? 'เลือกภาษาที่ต้องการใช้งานในระบบ' : 'Choose your preferred app language.'}
      </p>
      <div className='grid grid-cols-2 gap-2'>
        <Button
          variant={locale === 'th' ? 'default' : 'secondary'}
          className={locale === 'th' ? 'h-11 rounded-xl' : 'h-11 rounded-xl'}
          onClick={() => setLocale('th')}
        >
          ไทย
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
        {locale === 'th' ? 'กดยืนยันเพื่อออกจากระบบในอุปกรณ์นี้' : 'Confirm to sign out from this device.'}
      </p>
      <Button variant='destructive' className='h-11 rounded-xl' onClick={() => void logout()} disabled={loading}>
        {loading ? (locale === 'th' ? 'กำลังออกจากระบบ...' : 'Signing out...') : (locale === 'th' ? 'ยืนยันออกจากระบบ' : 'Sign out')}
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
            ? (locale === 'th' ? 'เปลี่ยนภาษา' : 'Change language')
            : locale === 'th'
              ? 'ออกจากระบบ'
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
      <h1 className='text-3xl font-semibold leading-tight text-slate-900'>{t('settings.title')}</h1>
      <p className='text-sm leading-6 text-slate-500'>{locale === 'th' ? 'เลือกเมนูที่ต้องการปรับแต่งโปรไฟล์ของคุณ' : 'Select a menu to update your profile settings.'}</p>
      <div className='grid gap-3.5'>
        {menuBtn('name', t('settings.nameTitle'), UserRound)}
        {menuBtn('email', t('settings.emailTitle'), Mail)}
        {menuBtn('password', t('settings.passwordTitle'), Lock)}
        {menuBtn('pin', t('settings.pinTitle'), KeyRound)}
        {menuBtn('language', locale === 'th' ? 'เปลี่ยนภาษา' : 'Change language', Languages)}
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
              {locale === 'th' ? 'การแจ้งเตือน' : 'Notifications'}
            </span>
          </span>
          <ChevronRight className='h-4 w-4 text-slate-400' />
        </button>
        {menuBtn('logout', locale === 'th' ? 'ออกจากระบบ' : 'Sign out', LogOut)}
      </div>

      {body && (
        <div className='fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px]' onClick={() => setActive('')}>
          <div className='absolute inset-x-0 bottom-0 mx-auto w-[calc(100%-12px)] max-w-[540px] rounded-t-[30px] bg-white px-5 pt-5 pb-6 shadow-[0_-10px_40px_rgba(15,23,42,0.24)]' onClick={(ev) => ev.stopPropagation()}>
            <div className='mb-5 flex items-center justify-between'>
              <h2 className='text-xl font-semibold leading-tight text-slate-900'>
                {activeTitle}
              </h2>
              <button type='button' className='rounded-full p-1 text-slate-500 hover:bg-slate-100' onClick={() => setActive('')} aria-label='Close'>
                <X className='h-5 w-5' />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}
    </section>
  );
}
