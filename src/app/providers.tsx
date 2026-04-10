'use client';

import { createElement, useEffect, type ReactNode } from 'react';
import { HeadsUpNotificationProvider } from '@/components/notifications/heads-up-provider';
import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/i18n/provider';

type ProvidersProps = {
  children?: ReactNode;
  runtimeBuildMarker: string;
};

export function Providers(props: ProvidersProps) {
  useEffect(function () {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const swUrl = '/sw.js?build=' + encodeURIComponent(props.runtimeBuildMarker);
    navigator.serviceWorker.register(swUrl, { scope: '/' }).catch(function () {
      // ignore register failure in dev
    });
  }, [props.runtimeBuildMarker]);

  return createElement(
    I18nProvider,
    null,
    createElement(
      ToastProvider,
      null,
      createElement(HeadsUpNotificationProvider, null, props.children),
    ),
  );
}
