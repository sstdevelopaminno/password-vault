import { NextResponse } from 'next/server';
import { requireAdminContext } from '@/lib/admin';
import { requirePinAssertion } from '@/lib/pin-guard';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordApiMetric } from '@/lib/api-metrics';

const ROUTE_PATH = '/api/admin/view-user-vault';

function parseLimit(raw: unknown, fallback = 50, max = 200) {
 const value = Number(raw ?? fallback);
 if (!Number.isFinite(value)) return fallback;
 return Math.min(max, Math.max(1, Math.floor(value)));
}

function decodeCursor(raw: unknown): { updated_at: string; id: string } | null {
 if (typeof raw !== 'string' || !raw) return null;
 try {
 const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
 if (typeof parsed?.updated_at !== 'string' || typeof parsed?.id !== 'string') return null;
 return { updated_at: parsed.updated_at, id: parsed.id };
 } catch {
 return null;
 }
}

function encodeCursor(value: { updated_at: string; id: string }) {
 return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export async function POST(req: Request) {
 const startedAt = Date.now();
 const ctx = await requireAdminContext();
 if ('error' in ctx) {
 recordApiMetric(ROUTE_PATH, 'POST', 403, Date.now() - startedAt);
 return ctx.error;
 }

 const payload = await req.json().catch(() => ({}));
 const targetUserId = payload?.targetUserId;
 const limit = parseLimit(payload?.limit);
 const cursor = decodeCursor(payload?.cursor);

 if (!targetUserId) {
 recordApiMetric(ROUTE_PATH, 'POST', 400, Date.now() - startedAt);
 return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
 }

 const pinCheck = await requirePinAssertion({
 request: req,
 userId: ctx.authUser.id,
 action: 'admin_view_vault',
 targetItemId: targetUserId,
 });
 if (!pinCheck.ok) {
 recordApiMetric(ROUTE_PATH, 'POST', 403, Date.now() - startedAt);
 return pinCheck.response;
 }

 const admin = createAdminClient();
 let query = admin
 .from('vault_items')
 .select('id,title,category,url,updated_at')
 .eq('owner_user_id', targetUserId)
 .order('updated_at', { ascending: false })
 .order('id', { ascending: false })
 .limit(limit + 1);

 if (cursor) {
 query = query.or('updated_at.lt.' + cursor.updated_at + ',and(updated_at.eq.' + cursor.updated_at + ',id.lt.' + cursor.id + ')');
 }

 const { data: items, error } = await query;

 if (error) {
 recordApiMetric(ROUTE_PATH, 'POST', 400, Date.now() - startedAt);
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const hasMore = (items ?? []).length > limit;
 const currentPage = (items ?? []).slice(0, limit);
 const last = currentPage[currentPage.length - 1];
 const nextCursor = hasMore && last
 ? encodeCursor({
 updated_at: new Date(last.updated_at).toISOString(),
 id: String(last.id),
 })
 : null;

 await logAudit('admin_viewed_user_vault', { target_user_id: targetUserId, item_count: currentPage.length });
 recordApiMetric(ROUTE_PATH, 'POST', 200, Date.now() - startedAt);
 return NextResponse.json({ items: currentPage, pagination: { limit, hasMore, nextCursor } });
}

