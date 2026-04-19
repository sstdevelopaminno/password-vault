'use client';

export const PHONE_PROTECTION_ENABLED_KEY = 'pv_phone_protection_enabled_v1';

export function readPhoneProtectionEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PHONE_PROTECTION_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePhoneProtectionEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.localStorage.setItem(PHONE_PROTECTION_ENABLED_KEY, '1');
    } else {
      window.localStorage.removeItem(PHONE_PROTECTION_ENABLED_KEY);
    }
  } catch {
    // ignore storage errors
  }
}
