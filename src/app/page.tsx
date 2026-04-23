'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react';
import { MobileShell } from '@/components/layout/mobile-shell';
import { Button } from '@/components/ui/button';
import { AndroidApkDownloadButton } from '@/components/app/android-apk-download-button';
import { useI18n } from '@/i18n/provider';
import { BRAND_LOGO_URL } from '@/lib/brand-logo';

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <MobileShell>
      <main className='relative flex flex-1 flex-col overflow-hidden px-6 pb-8 pt-[calc(env(safe-area-inset-top)+1.2rem)]'>
        <div className='pointer-events-none absolute inset-0 -z-10'>
          <div className='absolute left-1/2 top-[55%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(56,216,255,0.09),transparent_62%)]' />
          <div className='absolute -left-28 bottom-[-120px] h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl' />
          <div className='absolute -right-20 top-[22%] h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-3xl' />
        </div>

        <section className='mt-6 flex flex-col items-center text-center'>
          <div className='brand-logo-box neon-panel mx-auto flex h-[108px] w-[108px] items-center justify-center rounded-[30px] border border-[rgba(125,146,224,0.34)] bg-[linear-gradient(180deg,rgba(8,16,38,0.92),rgba(6,10,28,0.96))]'>
            <Image src={BRAND_LOGO_URL} alt='Vault Logo' width={88} height={88} className='h-[88px] w-[88px] rounded-[22px] object-cover' priority />
            <ShieldCheck className='hidden' />
          </div>
          <h1 className='neon-title mt-6 text-[46px] font-semibold leading-[0.96] tracking-[-0.03em]'>{t('common.appName')}</h1>
          <p className='mt-2 text-[17px] font-semibold text-[#dbe8ff]'>by Master Password</p>
          <div className='neon-divider mt-5 w-28' />
          <p className='mt-5 max-w-[340px] text-[16px] leading-7 text-[#9aaace]'>{t('landing.subtitle')}</p>
        </section>

        <section className='mx-auto mt-12 flex w-full max-w-[420px] flex-col gap-4'>
          <Link href='/login' className='block'>
            <Button className='h-14 w-full justify-between rounded-[20px] px-5 text-[17px] font-semibold'>
              <span className='inline-flex items-center gap-3'>
                <LockKeyhole className='h-6 w-6' />
                {t('landing.login')}
              </span>
              <ArrowRight className='h-6 w-6' />
            </Button>
          </Link>
          <Link href='/register' className='block'>
            <Button variant='secondary' className='h-14 w-full justify-between rounded-[20px] px-5 text-[17px] font-semibold'>
              <span className='inline-flex items-center gap-3'>
                <UserPlus className='h-6 w-6' />
                {t('landing.createAccount')}
              </span>
              <ArrowRight className='h-6 w-6' />
            </Button>
          </Link>
          <AndroidApkDownloadButton className='pt-2' />
        </section>

        <section className='mt-auto pb-4 text-center'>
          <div className='mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(118,143,220,0.4)] bg-[rgba(10,17,41,0.84)] text-[#5dd8ff] shadow-[0_0_24px_rgba(98,119,255,0.2)]'>
            <ShieldCheck className='h-8 w-8' />
          </div>
          <p className='mt-3 text-[16px] font-semibold text-[#eef4ff]'>เข้ารหัสข้อมูลอย่างปลอดภัย</p>
          <p className='mt-1 text-sm text-[#90a3ca]'>ปกป้องรหัสผ่านและข้อมูลสำคัญของคุณ</p>
        </section>
      </main>
    </MobileShell>
  );
}
