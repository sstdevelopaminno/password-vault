import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildLocalMdmOverview, listMdmAuditRows, requestUpstreamMdmOverview } from '@/lib/mdm-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = String(profile?.role ?? '');
  if (!['admin', 'super_admin', 'approver'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const upstream = await requestUpstreamMdmOverview(user);
  if (upstream?.ok) {
    return NextResponse.json(upstream.payload, { headers: { 'x-mdm-source': 'upstream' } });
  }

  const rows = await listMdmAuditRows(supabase, user.id);
  const overview = buildLocalMdmOverview(user, rows);

  return NextResponse.json(overview, {
    headers: { 'x-mdm-source': upstream ? 'fallback_after_upstream_error' : 'local' },
  });
}
