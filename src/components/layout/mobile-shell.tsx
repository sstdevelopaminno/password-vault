import type { ReactNode } from 'react'; 
import { LanguageSwitcher } from '@/components/layout/language-switcher'; 
import { TopQuickActions } from '@/components/layout/top-quick-actions'; 
 
export function MobileShell({ children }: { children: ReactNode }) { 
  return ( 
    <div className='app-shell flex min-h-dvh flex-col'> 
      <div className='flex items-center justify-end gap-2 px-4 pt-3'> 
        <TopQuickActions /> 
        <LanguageSwitcher /> 
      </div> 
      {children} 
    </div> 
  ); 
}
