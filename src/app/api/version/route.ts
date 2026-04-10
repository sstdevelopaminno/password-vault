import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/app-version';
import { RUNTIME_SCHEMA_VERSION } from '@/lib/pwa-runtime';
import { getRuntimeBuildMarker } from '@/lib/runtime-build';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      appVersion: APP_VERSION,
      marker: getRuntimeBuildMarker(),
      schemaVersion: RUNTIME_SCHEMA_VERSION,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
  );
}