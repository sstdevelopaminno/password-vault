import type { MetadataRoute } from 'next';
import { APP_ICON_192, APP_ICON_512, APP_ICON_MASKABLE } from '@/lib/pwa-runtime';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vault',
    short_name: 'Vault',
    description: 'Secure mobile-first password manager',
    id: '/',
    scope: '/',
    start_url: '/home',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait',
    background_color: '#f4f7ff',
    theme_color: '#2563eb',
    lang: 'th',
    categories: ['security', 'productivity', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: APP_ICON_192, sizes: '192x192', type: 'image/png' },
      { src: APP_ICON_512, sizes: '512x512', type: 'image/png' },
      { src: APP_ICON_MASKABLE, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'เบอร์โทรลับ', short_name: 'เบอร์ลับ', url: '/private-contacts' },
      { name: 'ใบเสร็จ/แจ้งหนี้', short_name: 'บิล', url: '/billing' },
      { name: 'ตั้งค่า', short_name: 'ตั้งค่า', url: '/settings' },
    ],
  };
}
