import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

function currentMarker() {
 const marker = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || APP_VERSION;
 return String(marker ?? APP_VERSION);
}

export async function GET() {
 return NextResponse.json(
 { ok: true, appVersion: APP_VERSION, marker: currentMarker() },
 { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
 );
}
