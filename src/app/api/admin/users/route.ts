import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminContext } from '@/lib/admin';
import { logAudit } from '@/lib/audit';
import { recordApiMetric } from '@/lib/api-metrics';

const ROUTE_PATH = '/api/admin/users';

function parseLimit(raw: string | null, fallback = 50, max = 100) {
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
 const limit = parseLimit(searchParams.get('limit'));
 const cursor = decodeCursor(searchParams.get('cursor'));

 const admin = createAdminClient();
 let query = admin
 .from('profiles')
 .select('id,email,full_name,role,status,created_at')
 .order('created_at', { ascending: false })
 .order('id', { ascending: false })
 .limit(limit + 1);

 if (cursor) {
 query = query.or('created_at.lt.' + cursor.created_at + ',and(created_at.eq.' + cursor.created_at + ',id.lt.' + cursor.id + ')');
 }

 const { data, error } = await query;

 if (error) {
 recordApiMetric(ROUTE_PATH, 'GET', 400, Date.now() - startedAt);
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const hasMore = (data ?? []).length > limit;
 const users = (data ?? []).slice(0, limit);
 const last = users[users.length - 1];
 const nextCursor = hasMore && last
 ? encodeCursor({
 created_at: new Date(last.created_at).toISOString(),
 id: String(last.id),
 })
 : null;

 recordApiMetric(ROUTE_PATH, 'GET', 200, Date.now() - startedAt);
 return NextResponse.json({ users, pagination: { limit, hasMore, nextCursor } });
}

export async function PATCH(req: Request) {
 const ctx = await requireAdminContext();
 if ('error' in ctx) {
 return ctx.error;
 }

 const { userId, role, status, fullName } = await req.json();
 if (!userId) {
 return NextResponse.json({ error: 'userId is required' }, { status: 400 });
 }

 const updates: Record<string, string> = {};
 if (role) updates.role = role;
 if (status) updates.status = status;
 if (fullName) updates.full_name = fullName;

 const admin = createAdminClient();
 const { error } = await admin.from('profiles').update(updates).eq('id', userId);
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 await logAudit('admin_user_updated', { target_user_id: userId, updates });
 return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
 const ctx = await requireAdminContext();
 if ('error' in ctx) {
 return ctx.error;
 }

 const { searchParams } = new URL(req.url);
 const userId = searchParams.get('userId');
 if (!userId) {
 return NextResponse.json({ error: 'userId is required' }, { status: 400 });
 }
 if (userId === ctx.authUser.id) {
 return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
 }

 const admin = createAdminClient();
 const { error } = await admin.auth.admin.deleteUser(userId);
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 await logAudit('admin_user_deleted', { target_user_id: userId });
 return NextResponse.json({ ok: true });
}

