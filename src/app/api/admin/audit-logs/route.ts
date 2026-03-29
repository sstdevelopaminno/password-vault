import { NextResponse } from 'next/server';
import { requireAdminContext } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordApiMetric } from '@/lib/api-metrics';

const ROUTE_PATH = '/api/admin/audit-logs';

function escapeCsv(value: unknown) {
 const quote = String.fromCharCode(34);
 const text = String(value ?? '').split(quote).join(quote + quote);
 return quote + text + quote;
}

function parseLimit(raw: string | null, fallback: number, max: number) {
 const value = Number(raw ?? fallback);
 if (!Number.isFinite(value)) return fallback;
 return Math.min(max, Math.max(1, Math.floor(value)));
}

function decodeCursor(raw: string | null): { created_at: string; id: string } | null {
 if (!raw) return null;
 try {
 const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
 if (typeof parsed?.created_at !== 'string' || typeof parsed?.id !== 'string') return null;
 return { created_at: parsed.created_at, id: parsed.id };
 } catch {
 return null;
 }
}

function encodeCursor(value: { created_at: string; id: string }) {
 return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export async function GET(req: Request) {
 const startedAt = Date.now();
 const ctx = await requireAdminContext();
 if ('error' in ctx) {
 recordApiMetric(ROUTE_PATH, 'GET', 403, Date.now() - startedAt);
 return ctx.error;
 }

 const { searchParams } = new URL(req.url);
 const q = String(searchParams.get('q') ?? '').trim();
 const action = String(searchParams.get('action') ?? '').trim();
 const from = String(searchParams.get('from') ?? '').trim();
 const to = String(searchParams.get('to') ?? '').trim();
 const format = String(searchParams.get('format') ?? 'json').toLowerCase();
 const cursor = format === 'json' ? decodeCursor(searchParams.get('cursor')) : null;
 const limit = format === 'csv'
 ? parseLimit(searchParams.get('limit'), 2000, 5000)
 : parseLimit(searchParams.get('limit'), 100, 200);

 const admin = createAdminClient();
 let query = admin
 .from('audit_logs')
 .select('id,action_type,target_user_id,target_vault_item_id,metadata_json,created_at,actor_user_id')
 .order('created_at', { ascending: false })
 .order('id', { ascending: false })
 .limit(format === 'json' ? limit + 1 : limit);

 if (action) query = query.eq('action_type', action);
 if (q) query = query.ilike('action_type', '%' + q + '%');
 if (from) query = query.gte('created_at', new Date(from).toISOString());
 if (to) {
 const end = new Date(to);
 end.setHours(23, 59, 59, 999);
 query = query.lte('created_at', end.toISOString());
 }
 if (cursor) {
 query = query.or('created_at.lt.' + cursor.created_at + ',and(created_at.eq.' + cursor.created_at + ',id.lt.' + cursor.id + ')');
 }

 const { data, error } = await query;
 if (error) {
 recordApiMetric(ROUTE_PATH, 'GET', 400, Date.now() - startedAt);
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const logs = data ?? [];

 if (format === 'csv') {
 const header = ['id','action_type','created_at','actor_user_id','target_user_id','target_vault_item_id','metadata_json'].join(',');
 const rows = logs.map((log) => [
 escapeCsv(log.id),
 escapeCsv(log.action_type),
 escapeCsv(log.created_at),
 escapeCsv(log.actor_user_id),
 escapeCsv(log.target_user_id),
 escapeCsv(log.target_vault_item_id),
 escapeCsv(JSON.stringify(log.metadata_json ?? {})),
 ].join(','));
 const eol = String.fromCharCode(10);
 const csvText = header + eol + rows.join(eol);

 recordApiMetric(ROUTE_PATH, 'GET', 200, Date.now() - startedAt);
 return new NextResponse(csvText, {
 status: 200,
 headers: {
 'Content-Type': 'text/csv; charset=utf-8',
 'Content-Disposition': 'attachment; filename=audit-logs-' + Date.now() + '.csv',
 },
 });
 }

 const hasMore = logs.length > limit;
 const currentPage = logs.slice(0, limit);
 const last = currentPage[currentPage.length - 1];
 const nextCursor = hasMore && last
 ? encodeCursor({
 created_at: new Date(last.created_at).toISOString(),
 id: String(last.id),
 })
 : null;

 recordApiMetric(ROUTE_PATH, 'GET', 200, Date.now() - startedAt);
 return NextResponse.json({ logs: currentPage, pagination: { limit, hasMore, nextCursor } });
}

