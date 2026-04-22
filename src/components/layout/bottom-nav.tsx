'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { FileText, House, Key, KeyRound, LayoutDashboard, ScrollText, Settings, ShieldCheck, User } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function isActivePath(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function BottomNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const userItems: Item[] = useMemo(
    () => [
      { href: '/home', label: t('nav.home'), icon: House },
      { href: '/notes', label: t('nav.notes'), icon: FileText },
      { href: '/vault', label: t('nav.privateVault'), icon: KeyRound },
      { href: '/org-shared', label: t('nav.teamVault'), icon: Key },
      { href: '/settings', label: t('nav.settings'), icon: Settings },
    ],
    [t],
  );

  const adminItems: Item[] = useMemo(
    () => [
      { href: '/dashboard', label: t('nav.home'), icon: LayoutDashboard },
      { href: '/approvals', label: t('nav.approvals'), icon: ShieldCheck },
      { href: '/users', label: t('nav.users'), icon: User },
      { href: '/audit-logs', label: t('nav.audit'), icon: ScrollText },
    ],
    [t],
  );

  const items = admin ? adminItems : userItems;

  return (
    <nav className='pointer-events-none absolute inset-x-0 bottom-0 z-50 w-full px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 will-change-transform'>
      <div className='pointer-events-auto rounded-[26px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(7,13,34,0.94),rgba(5,10,26,0.98))] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-xl'>
        <ul className='grid gap-1.5' style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    'group flex min-h-[62px] w-full select-none touch-manipulation flex-col items-center justify-center gap-1 rounded-[18px] border px-1.5 py-1 text-[10px] font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ' +
                    (active
                      ? 'border-[rgba(129,151,255,0.36)] bg-[linear-gradient(135deg,rgba(15,60,150,0.58),rgba(82,34,148,0.58))] text-[#63c9ff] shadow-[0_0_24px_rgba(78,88,255,0.3),inset_0_0_24px_rgba(255,255,255,0.06)]'
                      : 'border-transparent text-[#95a8d0] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#cedcff]')
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={'h-[18px] w-[18px] ' + (active ? 'text-[#28c8ff]' : 'text-[#8396be] group-hover:text-[#d3e2ff]')} />
                  <span className='line-clamp-2 min-h-[20px] px-0.5 text-center text-[10px] leading-tight'>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
