'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Cog, FileText, House, KeyRound, KeySquare, LayoutDashboard, ScrollText, ShieldCheck, User } from 'lucide-react';
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

  const userItems: Item[] = useMemo(() => {
    const items: Item[] = [
      { href: '/home', label: t('nav.home'), icon: House },
      { href: '/notes', label: t('nav.notes'), icon: FileText },
      { href: '/vault', label: t('nav.vault'), icon: KeyRound },
      { href: '/org-shared', label: t('nav.orgShared'), icon: KeySquare },
      { href: '/settings', label: t('nav.settings'), icon: Cog },
    ];
    return items;
  }, [t]);

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
      <div className='pointer-events-auto rounded-[20px] border border-[var(--border-soft)] bg-white/92 p-1.5 shadow-[0_10px_28px_rgba(20,44,98,0.16)] backdrop-blur-xl'>
        <ul className='grid gap-1.5' style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    'group flex min-h-[58px] w-full select-none touch-manipulation flex-col items-center justify-center gap-1 rounded-[14px] px-1.5 py-1 text-[10px] font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ' +
                    (active
                      ? 'bg-gradient-to-r from-sky-100 via-indigo-100 to-fuchsia-100 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.22)]'
                      : 'text-slate-500 hover:bg-slate-100/80')
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={'h-[17px] w-[17px] ' + (active ? 'text-blue-700' : 'text-slate-500 group-hover:text-slate-700')} />
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
