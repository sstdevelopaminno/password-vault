import type { Metadata, Viewport } from 'next';
import { createElement, type ReactNode } from 'react';
import { Noto_Sans_Thai } from "next/font/google";
import { Providers } from '@/app/providers';
import { APP_ICON_192 } from '@/lib/pwa-runtime';
import { getRuntimeBuildMarker } from '@/lib/runtime-build';
import './globals.css';

const runtimeBuildMarker = getRuntimeBuildMarker();
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-noto-sans-thai",
});

export const metadata: Metadata = {
  title: 'Vault',
  description: 'Mobile-first password manager with OTP, PIN and RBAC',
  icons: {
    icon: [{ url: APP_ICON_192, type: 'image/svg+xml' }],
    shortcut: [{ url: APP_ICON_192, type: 'image/svg+xml' }],
    apple: [{ url: APP_ICON_192, type: 'image/svg+xml' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vault',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
  viewportFit: 'cover',
};

export default function RootLayout(props: { children: ReactNode }) {
  return createElement(
    'html',
    { lang: 'th' },
    createElement(
      'body',
      { className: notoSansThai.variable },
      createElement(Providers, { runtimeBuildMarker: runtimeBuildMarker }, props.children),
    ),
  );
}
