import type { MetadataRoute } from 'next';
import { APP_ICON_192, APP_ICON_512, APP_ICON_MASKABLE } from '@/lib/pwa-runtime';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Password Vault',
    short_name: 'Vault',
    description: 'Secure mobile-first password manager',
    id: '/',
    scope: '/',
    start_url: '/home',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    background_color: '#f4f7ff',
    theme_color: '#2563eb',
    lang: 'th',
    icons: [
      { src: APP_ICON_192, sizes: '192x192', type: 'image/svg+xml' },
      { src: APP_ICON_512, sizes: '512x512', type: 'image/svg+xml' },
      { src: APP_ICON_MASKABLE, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}