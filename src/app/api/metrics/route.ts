import { NextResponse } from 'next/server';
import { requireAdminContext } from '@/lib/admin';
import { getApiMetricsSnapshot, recordApiMetric, resetApiMetrics } from '@/lib/api-metrics';

const ROUTE_PATH = '/api/metrics';

function parseWindowSec(input: string | null) {
 const value = Number(input ?? 60);
 if (!Number.isFinite(value)) return 60;
 return Math.min(300, Math.max(10, Math.floor(value)));
}

export async function GET(req: Request) {
 const startedAt = Date.now();
 const ctx = await requireAdminContext();
 if ('error' in ctx) {
 recordApiMetric(ROUTE_PATH, 'GET', 403, Date.now() - startedAt);
 return ctx.error;
 }

 const { searchParams } = new URL(req.url);
 const windowSec = parseWindowSec(searchParams.get('windowSec'));
 const routeFilter = String(searchParams.get('route') ?? '').trim();

 const snapshot = getApiMetricsSnapshot(windowSec, routeFilter);
 const response = NextResponse.json({ ok: true, ...snapshot });
 recordApiMetric(ROUTE_PATH, 'GET', 200, Date.now() - startedAt);
 return response;
}

export async function POST(req: Request) {
 const startedAt = Date.now();
 const ctx = await requireAdminContext();
 if ('error' in ctx) {
 recordApiMetric(ROUTE_PATH, 'POST', 403, Date.now() - startedAt);
 return ctx.error;
 }

 const payload = await req.json().catch(() => ({}));
 if (payload?.action !== 'reset') {
 recordApiMetric(ROUTE_PATH, 'POST', 400, Date.now() - startedAt);
 return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
 }

 resetApiMetrics();
 recordApiMetric(ROUTE_PATH, 'POST', 200, Date.now() - startedAt);
 return NextResponse.json({ ok: true, reset: true });
}

