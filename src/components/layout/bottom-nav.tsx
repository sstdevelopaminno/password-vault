'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
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
    <nav className='bottom-nav-root pointer-events-none absolute inset-x-0 bottom-0 z-50 w-full px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 will-change-transform'>
      <div className='pointer-events-auto rounded-[26px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(24,38,86,0.88),rgba(17,29,68,0.92))] p-1.5 shadow-[0_18px_40px_rgba(7,12,30,0.2),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl'>
        <ul className='grid gap-1.5' style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const homeItem = item.href === '/home' && !admin;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    'group flex min-h-[62px] w-full select-none touch-manipulation flex-col items-center justify-center gap-1 rounded-[18px] border px-1.5 py-1 text-[11px] font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ' +
                    (active
                      ? 'border-[rgba(159,182,255,0.34)] bg-[linear-gradient(135deg,rgba(67,109,210,0.52),rgba(106,79,203,0.48))] text-[#eaf4ff] shadow-[0_0_24px_rgba(78,88,255,0.18),inset_0_0_24px_rgba(255,255,255,0.08)]'
                      : 'border-transparent text-[#b8c8e8] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#eff5ff]')
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  {homeItem ? (
                    <span
                      className={
                        'inline-flex h-[23px] w-[23px] items-center justify-center rounded-[7px] ' +
                        (active
                          ? 'bg-[radial-gradient(circle,rgba(73,222,255,0.3),rgba(66,110,255,0.15))] shadow-[0_0_14px_rgba(70,199,255,0.36)]'
                          : 'bg-[rgba(255,255,255,0.03)]')
                      }
                    >
                      <Image
                        src='/icons/vault-logo.png'
                        alt='Home'
                        width={20}
                        height={20}
                        className={'h-5 w-5 rounded-[5px] object-cover ' + (active ? '' : 'opacity-85 group-hover:opacity-100')}
                        priority={false}
                      />
                    </span>
                  ) : (
                    <Icon className={'h-[22px] w-[22px] ' + (active ? 'text-[#9ce8ff]' : 'text-[#a9badc] group-hover:text-[#eef5ff]')} />
                  )}
                  <span className='line-clamp-2 min-h-[21px] px-0.5 text-center text-[11px] leading-tight'>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
