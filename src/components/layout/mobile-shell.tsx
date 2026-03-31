import type { ReactNode } from 'react'; 
import { TopQuickActions } from '@/components/layout/top-quick-actions'; 
 
export function MobileShell({ children }: { children: ReactNode }) { 
  return ( 
    <div className='app-shell flex min-h-dvh flex-col'> 
      <div className='flex items-center justify-end gap-2 px-4 pt-3'> 
        <TopQuickActions /> 
      </div> 
      {children} 
    </div> 
  ); 
}
