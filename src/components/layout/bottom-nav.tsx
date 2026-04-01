'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, ScrollText, ShieldCheck, User, Vault } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Role = 'pending' | 'user' | 'approver' | 'admin' | 'super_admin';

const ELEVATED_ROLES: Role[] = ['approver', 'admin', 'super_admin'];

function isActivePath(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function BottomNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const { t, locale } = useI18n();

  const [canSeeRequests, setCanSeeRequests] = useState(() => {
    if (admin) return false;
    if (typeof window === 'undefined') return false;
    const cachedRole = window.sessionStorage.getItem('pv_role');
    return Boolean(cachedRole && ELEVATED_ROLES.includes(cachedRole as Role));
  });

  useEffect(() => {
    if (admin) return;
    const controller = new AbortController();
    void fetch('/api/profile/me', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { role?: string };
        const role = String(body.role ?? 'user') as Role;
        window.sessionStorage.setItem('pv_role', role);
        setCanSeeRequests(ELEVATED_ROLES.includes(role));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [admin]);

  const userItems: Item[] = useMemo(() => {
    const items: Item[] = [
      { href: '/home', label: t('nav.home'), icon: Home },
      { href: '/vault', label: t('nav.vault'), icon: Vault },
    ];
    if (canSeeRequests) {
      items.push({
        href: '/requests',
        label: locale === 'th' ? 'คำขอสมัคร' : 'Requests',
        icon: ShieldCheck,
      });
    }
    items.push({ href: '/settings', label: t('nav.settings'), icon: User });
    return items;
  }, [canSeeRequests, locale, t]);

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
    <nav className='fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[460px] px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2'>
      <div className='rounded-[20px] border border-[var(--border-soft)] bg-white/92 p-1.5 shadow-[0_10px_28px_rgba(20,44,98,0.16)] backdrop-blur-xl'>
        <ul className='grid gap-1.5' style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    'group flex min-h-[58px] w-full select-none flex-col items-center justify-center gap-0.5 rounded-[14px] px-2 py-1 text-[11px] font-semibold transition active:scale-[0.98] ' +
                    (active
                      ? 'bg-gradient-to-r from-sky-100 via-indigo-100 to-fuchsia-100 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.22)]'
                      : 'text-slate-500 hover:bg-slate-100/80')
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={'h-4 w-4 ' + (active ? 'text-blue-700' : 'text-slate-500 group-hover:text-slate-700')} />
                  <span className='truncate'>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
