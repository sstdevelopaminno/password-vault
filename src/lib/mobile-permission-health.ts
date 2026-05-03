'use client';

import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import { requestVaultShieldCameraPermission } from '@/lib/vault-shield';

export type MobilePermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unavailable'
  | 'unknown'
  | 'denied_permanently';

export type MobilePermissionHealthReport = {
  runtimeMode: string;
  notification: MobilePermissionState;
  camera: MobilePermissionState;
  pushSupported: boolean;
  serviceWorkerSupported: boolean;
  checkedAt: string;
};

async function queryWebPermission(name: 'camera' | 'notifications'): Promise<MobilePermissionState> {
  if (typeof window === 'undefined') return 'unknown';

  const nav = navigator as Navigator & {
    permissions?: {
      query: (descriptor: PermissionDescriptor) => Promise<{ state: MobilePermissionState }>;
    };
  };

  if (!nav.permissions?.query) return 'unavailable';

  try {
    const result = await nav.permissions.query({ name } as PermissionDescriptor);
    if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') {
      return result.state;
    }
    return 'unknown';
  } catch {
    return 'unavailable';
  }
}

async function queryNativeNotificationPermission() {
  try {
    const plugin = await import('@capacitor/local-notifications');
    const permission = await plugin.LocalNotifications.checkPermissions();
    const display = String(permission.display ?? '').toLowerCase();
    if (display === 'granted') return 'granted' as const;
    if (display === 'denied') return 'denied' as const;
    if (display === 'prompt' || display === 'prompt-with-rationale' || display === 'default') return 'prompt' as const;
    return 'unknown' as const;
  } catch {
    return 'unavailable' as const;
  }
}

export async function readMobilePermissionHealthReport(options?: {
  requestNativeCameraPermission?: boolean;
}): Promise<MobilePermissionHealthReport> {
  const runtime = detectRuntimeCapabilities();

  const notification: MobilePermissionState = runtime.isCapacitorNative
    ? await queryNativeNotificationPermission()
    : (
      typeof Notification === 'undefined'
        ? 'unavailable'
        : Notification.permission === 'granted'
          ? 'granted'
          : Notification.permission === 'denied'
            ? 'denied'
            : 'prompt'
    );

  let camera: MobilePermissionState = await queryWebPermission('camera');
  if (runtime.isCapacitorNative && runtime.isAndroid && options?.requestNativeCameraPermission) {
    camera = await requestVaultShieldCameraPermission();
  }

  return {
    runtimeMode: runtime.mode,
    notification,
    camera,
    pushSupported: typeof window !== 'undefined' && 'PushManager' in window,
    serviceWorkerSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    checkedAt: new Date().toISOString(),
  };
}

export function mobilePermissionTone(state: MobilePermissionState) {
  if (state === 'granted') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (state === 'prompt') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (state === 'denied' || state === 'denied_permanently') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

export function mobilePermissionLabel(state: MobilePermissionState) {
  if (state === 'granted') return 'อนุญาตแล้ว';
  if (state === 'prompt') return 'รออนุญาต';
  if (state === 'denied') return 'ถูกปฏิเสธ';
  if (state === 'denied_permanently') return 'ปฏิเสธถาวร';
  if (state === 'unavailable') return 'ไม่รองรับ';
  return 'ไม่ทราบสถานะ';
}
