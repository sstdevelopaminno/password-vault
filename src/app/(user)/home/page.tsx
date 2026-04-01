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
  const t = i18n.t; 
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
  const itemsText = locale === 'th' ? '\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e43\u0e19\u0e04\u0e25\u0e31\u0e07' : 'Vault Items'; 
  const securityText = locale === 'th' ? '\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e1b\u0e25\u0e2d\u0e14\u0e20\u0e31\u0e22\u0e23\u0e30\u0e1a\u0e1a' : 'System Security'; 
  const stabilityText = locale === 'th' ? '\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e16\u0e35\u0e22\u0e23\u0e23\u0e30\u0e1a\u0e1a' : 'System Stability'; 
  const roleLabel = locale === 'th' ? '\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c: ' : 'Role: ';
 
  return React.createElement('section', { className: 'space-y-4 pb-24 pt-3' }, 
    React.createElement(Card, { className: 'rounded-[24px] border-[var(--border-strong)] bg-white/92 px-4 py-4 shadow-[0_16px_34px_rgba(42,86,163,0.16)] backdrop-blur' }, 
      React.createElement('div', { className: 'flex items-center gap-3' }, 
        React.createElement('img', { src: LOGO_URL, alt: 'Master Password Logo', loading: 'lazy', className: 'h-14 w-14 rounded-2xl object-cover shadow-[0_8px_18px_rgba(79,123,255,0.22)]' }), 
        React.createElement('div', { className: 'min-w-0' }, 
          React.createElement('h1', { className: 'truncate text-[22px] font-semibold leading-7 text-slate-800' }, 'Master Password'), 
          React.createElement('p', { className: 'mt-0.5 text-[14px] leading-5 text-slate-500' }, versionText), 
          React.createElement('p', { className: 'text-[14px] leading-5 text-slate-500' }, roleLabel + roleText) 
        ) 
      ) 
    ), 
    React.createElement('div', { className: 'grid grid-cols-2 gap-3.5' },
      React.createElement(Card, { className: 'rounded-[18px] bg-white/88 px-3.5 py-3 shadow-[0_10px_24px_rgba(36,88,174,0.1)]' }, React.createElement('p', { className: 'text-[14px] leading-5 text-slate-500' }, itemsText), React.createElement('p', { className: 'mt-2 text-[34px] font-semibold leading-[1.05] text-slate-800' }, String(itemCount))), 
      React.createElement(Card, { className: 'rounded-[18px] bg-white/88 px-3.5 py-3 shadow-[0_10px_24px_rgba(36,88,174,0.1)]' }, React.createElement('p', { className: 'text-[14px] leading-5 text-slate-500' }, securityText), React.createElement('p', { className: 'mt-2 text-[34px] font-semibold leading-[1.05] text-slate-800' }, String(securityScore)), React.createElement('p', { className: 'mt-1 text-[14px] leading-5 text-slate-500' }, securityLabel)) 
    ), 
    React.createElement(Card, { className: 'rounded-[18px] bg-white/88 px-3.5 py-3 shadow-[0_10px_24px_rgba(36,88,174,0.1)]' }, React.createElement('p', { className: 'text-[14px] leading-5 text-slate-500' }, stabilityText), React.createElement('p', { className: 'mt-2 text-[36px] font-semibold leading-[1.05] text-slate-800' }, String(stabilityScore) + '/100')) 
  ); 
}
