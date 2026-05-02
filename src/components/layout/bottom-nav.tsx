'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { FileText, House, Key, KeyRound, LayoutDashboard, ScrollText, Settings, ShieldCheck, User } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

const HOME_NAV_ICON_URL =
  'https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/1919225369.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzE5MTkyMjUzNjkucG5nIiwiaWF0IjoxNzc3MTAxOTU3LCJleHAiOjE4MDg2Mzc5NTd9.tUuLB6jzmO_ru0Hqu0Blu2dCehGPlPoLynu7p9Kif8k';

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
    <nav className='bottom-nav-root pointer-events-none absolute inset-x-0 bottom-0 z-50 w-full px-3.5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 will-change-transform'>
      <div className='pointer-events-auto relative rounded-[32px] bg-[linear-gradient(110deg,rgba(40,230,255,0.7)_0%,rgba(96,127,255,0.62)_46%,rgba(235,82,255,0.78)_100%)] p-[1.5px] shadow-[0_0_0_1px_rgba(170,203,255,0.18),0_0_26px_rgba(100,117,255,0.4),0_0_38px_rgba(211,87,255,0.24)]'>
        <div className='rounded-[30px] border border-[rgba(171,193,255,0.26)] bg-[linear-gradient(180deg,rgba(20,35,88,0.94),rgba(11,23,65,0.96))] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl'>
          <ul className='grid gap-1.5' style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const homeItem = item.href === '/home' && !admin;
            const homeActive = homeItem && active;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    'group flex w-full select-none touch-manipulation flex-col items-center justify-center px-1.5 py-1.5 text-[12.5px] font-semibold transition-[transform,box-shadow,background,color] duration-200 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ' +
                    (homeActive
                      ? 'min-h-[72px] gap-1.5 rounded-[20px] bg-[linear-gradient(140deg,rgba(88,155,255,0.48),rgba(170,83,255,0.42))] text-[#eef6ff] shadow-[0_0_16px_rgba(80,145,255,0.3),0_0_24px_rgba(198,81,255,0.18)]'
                      : active
                        ? 'min-h-[72px] gap-1.5 rounded-[20px] bg-[linear-gradient(140deg,rgba(88,155,255,0.48),rgba(170,83,255,0.42))] text-[#eef6ff] shadow-[0_0_16px_rgba(80,145,255,0.3),0_0_24px_rgba(198,81,255,0.18)]'
                        : 'min-h-[72px] gap-1.5 rounded-[20px] text-[#b8c8e8] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#eff5ff]')
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  {homeItem ? (
                    <span
                      className={
                        'inline-flex items-center justify-center ' +
                        (homeActive
                          ? 'h-[30px] w-[30px] rounded-[9px] bg-[linear-gradient(145deg,rgba(73,222,255,0.26),rgba(66,110,255,0.14))] shadow-[0_0_10px_rgba(70,199,255,0.28)]'
                          : active
                            ? 'h-[30px] w-[30px] rounded-[9px] bg-[radial-gradient(circle,rgba(73,222,255,0.3),rgba(66,110,255,0.14))] shadow-[0_0_10px_rgba(70,199,255,0.28)]'
                            : 'h-[30px] w-[30px] rounded-[9px] bg-[rgba(255,255,255,0.03)]')
                      }
                    >
                      <Image
                        src={HOME_NAV_ICON_URL}
                        alt='Home'
                        width={32}
                        height={32}
                        className={
                          'rounded-[8px] object-cover ' +
                          'h-[26px] w-[26px]' +
                          (active ? '' : ' opacity-90 group-hover:opacity-100')
                        }
                        priority={false}
                      />
                    </span>
                  ) : (
                    <Icon className={'h-[24px] w-[24px] ' + (active ? 'text-[#9ce8ff]' : 'text-[#a9badc] group-hover:text-[#eef5ff]')} />
                  )}
                  <span
                    className='line-clamp-2 min-h-[24px] px-0.5 text-center text-[12.5px] leading-tight'
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
