import { NextResponse } from 'next/server';
import { requireAdminContext } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { requirePinAssertion } from '@/lib/pin-guard';
import { recordApiMetric } from '@/lib/api-metrics';

const ROUTE_PATH = '/api/admin/approvals';

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
 .from('approval_requests')
 .select('id,user_id,request_status,created_at,profiles!approval_requests_user_id_fkey(email,full_name)')
 .eq('request_status', 'pending')
 .order('created_at', { ascending: true })
 .order('id', { ascending: true })
 .limit(limit + 1);

 if (cursor) {
 query = query.or('created_at.gt.' + cursor.created_at + ',and(created_at.eq.' + cursor.created_at + ',id.gt.' + cursor.id + ')');
 }

 const { data, error } = await query;
 if (error) {
 recordApiMetric(ROUTE_PATH, 'GET', 400, Date.now() - startedAt);
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const hasMore = (data ?? []).length > limit;
 const requests = (data ?? []).slice(0, limit);
 const last = requests[requests.length - 1];
 const nextCursor = hasMore && last
 ? encodeCursor({
 created_at: new Date(last.created_at).toISOString(),
 id: String(last.id),
 })
 : null;

 recordApiMetric(ROUTE_PATH, 'GET', 200, Date.now() - startedAt);
 return NextResponse.json({ requests, pagination: { limit, hasMore, nextCursor } });
}

export async function POST(req: Request) {
 const ctx = await requireAdminContext();
 if ('error' in ctx) return ctx.error;

 const { userId, approved, rejectReason } = await req.json();
 if (!userId || typeof approved !== 'boolean') {
 return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 });
 }

 const pinCheck = requirePinAssertion({
 request: req,
 userId: ctx.authUser.id,
 action: approved ? 'approve_signup_request' : 'delete_signup_request',
 targetItemId: String(userId),
 });

 if (!pinCheck.ok) {
 return NextResponse.json({ error: 'กรุณายืนยัน PIN ก่อนทำรายการ' }, { status: 403 });
 }

 const decision = approved ? 'approved' : 'rejected';
 const reviewedAt = new Date().toISOString();

 const admin = createAdminClient();
 const { error: requestError } = await admin
 .from('approval_requests')
 .update({
 request_status: decision,
 reviewed_at: reviewedAt,
 reviewed_by: ctx.authUser.id,
 reject_reason: approved ? null : rejectReason ?? 'ลบคำขอโดยผู้ดูแล',
 })
 .eq('user_id', userId)
 .eq('request_status', 'pending');

 if (requestError) return NextResponse.json({ error: requestError.message }, { status: 400 });

 const profileUpdates = approved ? { status: 'active', role: 'user' } : { status: 'disabled' };
 const { error: profileError } = await admin.from('profiles').update(profileUpdates).eq('id', userId);
 if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

 await logAudit('approval_reviewed', {
 target_user_id: userId,
 decision,
 reject_reason: approved ? null : rejectReason ?? 'ลบคำขอโดยผู้ดูแล',
 });

 return NextResponse.json({ ok: true });
}

