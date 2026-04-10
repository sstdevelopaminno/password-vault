import { APP_VERSION } from '@/lib/app-version';

export function getRuntimeBuildMarker() {
  const marker = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || APP_VERSION;
  return String(marker ?? APP_VERSION).trim() || APP_VERSION;
}