'use client'; 
 
import Link from 'next/link'; 
import { ShieldCheck } from 'lucide-react'; 
import { MobileShell } from '@/components/layout/mobile-shell'; 
import { Button } from '@/components/ui/button'; 
import { Card } from '@/components/ui/card'; 
import { AndroidApkDownloadButton } from '@/components/app/android-apk-download-button';
import { useI18n } from '@/i18n/provider'; 
 
export default function LandingPage() { 
  const { t } = useI18n(); 
 
  return ( 
    <MobileShell> 
      <main className='relative flex flex-1 flex-col overflow-hidden px-5 pb-8 pt-3'> 
        <div className='pointer-events-none absolute inset-0 -z-10'> 
 <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(224,244,255,0.78)_0%,rgba(223,227,246,0.9)_44%,rgba(234,236,243,1)_100%)]' /> 
          <div className='absolute -top-16 -left-20 h-72 w-72 rounded-full bg-cyan-200/55 blur-3xl' /> 
          <div className='absolute top-0 right-[-80px] h-80 w-80 rounded-full bg-fuchsia-300/35 blur-3xl' /> 
          <div className='absolute -top-6 left-1/2 h-[18rem] w-[155%] -translate-x-1/2 rounded-b-[55%] bg-gradient-to-b from-white/40 via-white/22 to-transparent' /> 
           
        </div> 
 
        <div className='mt-[22svh] flex flex-col items-center gap-4 text-center'> 
          <div className='mx-auto flex h-[92px] w-[92px] items-center justify-center rounded-[26px] border border-[var(--border-soft)] bg-white/85 shadow-[0_14px_34px_rgba(59,130,246,0.2)] backdrop-blur-xl brand-logo-box'><ShieldCheck className='hidden' /></div> 
          <div> 
            <h1 className='text-[48px] font-semibold leading-[1.02] tracking-[-0.02em] text-slate-800'>{t('common.appName')}</h1> 
            <p className='mx-auto max-w-[330px] text-[16px] leading-6 text-slate-500'>{t('landing.subtitle')}</p> 
          </div> 
        </div> 
 
        <Card className='mx-auto mt-7 flex w-full max-w-[420px] flex-col gap-5 border-0 bg-transparent px-2 shadow-none'> 
          <Link href='/login'><Button className='h-11 w-full text-[15px]'>{t('landing.login')}</Button></Link> 
          <Link href='/register' className='block'> 
            <Button variant='secondary' className='h-11 w-full text-[15px] bg-white/72'>{t('landing.createAccount')}</Button> 
          </Link> 
          <AndroidApkDownloadButton className='pt-1' />
        </Card> 
      </main> 
    </MobileShell> 
  ); 
}

