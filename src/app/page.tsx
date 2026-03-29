'use client'; 
 
import Link from 'next/link'; 
import { ShieldCheck } from 'lucide-react'; 
import { MobileShell } from '@/components/layout/mobile-shell'; 
import { Button } from '@/components/ui/button'; 
import { Card } from '@/components/ui/card'; 
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
 
        <div className='mt-[32svh] flex items-center gap-3'> 
          <div className='rounded-2xl bg-blue-100 p-3 text-blue-600'><ShieldCheck className='h-6 w-6' /></div> 
          <div> 
            <h1 className='text-[38px] font-semibold leading-tight text-slate-800'>{t('common.appName')}</h1> 
            <p className='text-[15px] text-slate-500'>{t('landing.subtitle')}</p> 
          </div> 
        </div> 
 
        <Card className='mt-5 space-y-4 border-0 bg-transparent p-0 shadow-none'> 
          <Link href='/login'><Button className='h-11 w-full text-[15px]'>{t('landing.login')}</Button></Link> 
          <Link href='/register' className='block pt-1'> 
            <Button variant='secondary' className='h-11 w-full text-[15px] bg-white/72'>{t('landing.createAccount')}</Button> 
          </Link> 
        </Card> 
      </main> 
    </MobileShell> 
  ); 
}






