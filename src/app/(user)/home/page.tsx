'use client'; 
 
import React, { useEffect, useMemo, useState } from 'react'; 
import { Card } from '@/components/ui/card'; 
import { useI18n } from '@/i18n/provider'; 
import { versionLabel } from '@/lib/app-version';
 
const LOGO_URL = 'https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/Imagemaster password.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0ltYWdlbWFzdGVyIHBhc3N3b3JkLnBuZyIsImlhdCI6MTc3NDcxOTUzNywiZXhwIjoxODA2MjU1NTM3fQ.k-KJDjjccxBz8odBvF-SKmrHEdKgMQHRSy__nohIeDk'; 
 
function clamp(value: number, min: number, max: number) { 
  return Math.max(min, Math.min(max, value)); 
}
 
export default function HomePage() { 
  const i18n = useI18n(); 
  const locale = i18n.locale;
  const itemState = useState(0); 
  const itemCount = itemState[0] as number; 
  const setItemCount = itemState[1] as any; 
  const secState = useState(66); 
  const securityScore = secState[0] as number; 
  const setSecurityScore = secState[1] as any; 
  const stState = useState(84); 
  const stabilityScore = stState[0] as number; 
  const setStabilityScore = stState[1] as any; 
 
  useEffect(function () { 
    let mounted = true; 
    fetch('/api/vault', { cache: 'no-store' }) 
      .then(function (res) { return res.json(); }) 
      .then(function (body) { 
        if (!mounted) return; 
        const count = Math.max(0, Number(body.pagination?.total ?? (Array.isArray(body.items) ? body.items.length : 0))); 
        setItemCount(count); 
        setSecurityScore(Math.round(clamp(58 + (count > 0 ? 10 : 0), 35, 99))); 
      }) 
      .catch(function () { }); 
    fetch('/api/profile/me', { cache: 'no-store' }) 
      .then(function (res) { return res.json(); }) 
      .then(function (body) { 
        if (!mounted) return; 
        const status = String(body.status ? body.status : 'active'); 
        if (status === 'approved') { setStabilityScore(88); return; } 
        if (status === 'active') { setStabilityScore(88); return; } 
        setStabilityScore(72); 
      }) 
      .catch(function () { }); 
    return function () { mounted = false; }; 
  }, []); 
 
  const securityLabel = useMemo(function () { 
    if (locale === 'th') return securityScore > 79 ? '\u0e14\u0e35' : '\u0e1b\u0e32\u0e19\u0e01\u0e25\u0e32\u0e07'; 
    return securityScore > 79 ? 'Good' : 'Moderate'; 
  }, [locale, securityScore]);
 
  const roleText = locale === 'th' ? '\u0e1c\u0e39\u0e49\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b' : 'General User'; 
  const versionText = versionLabel(locale);
  const securityText = locale === 'th' ? '\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e1b\u0e25\u0e2d\u0e14\u0e20\u0e31\u0e22\u0e23\u0e30\u0e1a\u0e1a' : 'System Security'; 
  const stabilityText = locale === 'th' ? '\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e16\u0e35\u0e22\u0e23\u0e23\u0e30\u0e1a\u0e1a' : 'System Stability'; 
  const roleLabel = locale === 'th' ? '\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c: ' : 'Role: ';
 
  return React.createElement('section', { className: 'space-y-4 pb-24 pt-2' },
    React.createElement('div', { className: 'flex items-center justify-between px-1' },
      React.createElement('div', null,
        React.createElement('p', { className: 'text-[38px] font-semibold leading-[1.02] tracking-[-0.02em] text-slate-900' }, 'Master Dashboard'),
        React.createElement('p', { className: 'mt-1 text-sm text-slate-500' }, versionText)
      ),
      React.createElement('div', { className: 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-white/88 text-lg font-semibold text-slate-600 shadow-[0_8px_24px_rgba(22,44,86,0.12)]' }, 'S')
    ),
    React.createElement(Card, { className: 'rounded-[24px] border-[var(--border-strong)] bg-white/92 px-4 py-4 shadow-[0_14px_34px_rgba(35,81,156,0.14)] backdrop-blur' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('img', { src: LOGO_URL, alt: 'Master Password Logo', loading: 'lazy', className: 'h-14 w-14 rounded-2xl object-cover shadow-[0_8px_18px_rgba(79,123,255,0.22)]' }),
        React.createElement('div', { className: 'min-w-0' },
          React.createElement('h1', { className: 'truncate text-[28px] font-semibold leading-8 text-slate-800' }, 'Master Password'),
          React.createElement('p', { className: 'mt-0.5 text-[14px] leading-5 text-slate-500' }, roleLabel + roleText)
        )
      )
    ),
    React.createElement(Card, { className: 'overflow-hidden rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/65 to-cyan-50/65 px-4 py-4 shadow-[0_20px_36px_rgba(16,139,128,0.18)]' },
      React.createElement('div', { className: 'flex items-end justify-between gap-3' },
        React.createElement('div', null,
          React.createElement('p', { className: 'text-sm font-medium text-emerald-900/80' }, locale === 'th' ? 'คะแนนความพร้อมระบบ' : 'System health score'),
          React.createElement('p', { className: 'mt-1 text-[82px] font-semibold leading-[0.9] tracking-[-0.03em] text-slate-900' }, String(Math.round(clamp(securityScore * 0.58 + stabilityScore * 0.42, 0, 99))))
        ),
        React.createElement('div', { className: 'inline-flex h-12 min-w-[136px] items-center justify-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(5,110,95,0.35)]' }, locale === 'th' ? 'ดำเนินการต่อ' : 'Continue')
      ),
      React.createElement('div', { className: 'mt-4 grid grid-cols-3 gap-2' },
        [4, -2, -6].map(function (offset, index) {
          var segment = clamp(Math.round(securityScore * 0.58 + stabilityScore * 0.42) + offset, 20, 100);
          return React.createElement('div', { key: String(index), className: 'h-2.5 overflow-hidden rounded-full bg-emerald-100/80' },
            React.createElement('div', { className: 'h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-300 transition-all duration-500', style: { width: String(segment) + '%' } })
          );
        })
      )
    ),
    React.createElement('div', { className: 'grid grid-cols-2 gap-3.5' },
      React.createElement(Card, { className: 'min-h-[158px] rounded-[20px] bg-white/90 px-3.5 py-3.5' },
        React.createElement('p', { className: 'text-xs font-medium text-slate-500' }, locale === 'th' ? 'รายการในคลัง' : 'Vault items'),
        React.createElement('p', { className: 'mt-1 text-[39px] font-semibold leading-[1.03] text-slate-900' }, String(itemCount)),
        React.createElement('p', { className: 'mt-2 text-xs text-slate-500' }, locale === 'th' ? 'รวมทุกหมวดหมู่' : 'All categories')
      ),
      React.createElement(Card, { className: 'min-h-[158px] rounded-[20px] bg-white/90 px-3.5 py-3.5' },
        React.createElement('p', { className: 'text-xs font-medium text-slate-500' }, securityText),
        React.createElement('p', { className: 'mt-1 text-[39px] font-semibold leading-[1.03] text-slate-900' }, String(securityScore)),
        React.createElement('p', { className: 'mt-2 text-xs text-slate-500' }, securityLabel)
      ),
      React.createElement(Card, { className: 'min-h-[158px] rounded-[20px] bg-white/90 px-3.5 py-3.5' },
        React.createElement('p', { className: 'text-xs font-medium text-slate-500' }, stabilityText),
        React.createElement('p', { className: 'mt-1 text-[32px] font-semibold leading-none text-slate-900' }, String(stabilityScore) + '/100'),
        React.createElement('div', { className: 'mt-3 flex items-end gap-1.5' },
          [24, 37, 58, 42, 31].map(function (value, index) {
            var adjusted = clamp(value + Math.round((stabilityScore - 70) * 0.4), 16, 82);
            return React.createElement('div', { key: String(index), className: 'w-4 rounded-sm bg-gradient-to-t from-emerald-300 to-cyan-300', style: { height: String(adjusted) + 'px' } });
          })
        )
      ),
      React.createElement(Card, { className: 'min-h-[158px] rounded-[20px] bg-white/90 px-3.5 py-3.5' },
        React.createElement('p', { className: 'text-xs font-medium text-slate-500' }, locale === 'th' ? 'การจัดการข้อมูล' : 'Data usage'),
        React.createElement('p', { className: 'mt-1 text-[30px] font-semibold leading-none text-slate-900' }, String(Number((itemCount * 0.74).toFixed(2))) + ' GB'),
        React.createElement('div', { className: 'mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-slate-700' }, locale === 'th' ? 'ติดตั้งตอนนี้' : 'Install now')
      )
    )
  );
}
