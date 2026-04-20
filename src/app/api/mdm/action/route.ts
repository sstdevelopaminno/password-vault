import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  type MdmActionName,
  requestUpstreamMdmAction,
  writeMdmAudit,
} from '@/lib/mdm-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const actionSchema = z
  .object({
    action: z.enum(['sync_policy', 'recheck_compliance', 'enroll_device']),
  })
  .strict();

function defaultMessage(action: MdmActionName) {
  if (action === 'sync_policy') return 'Policy sync queued';
  if (action === 'recheck_compliance') return 'Compliance re-check queued';
  return 'Enrollment request queued';
}

function actionAuditType(action: MdmActionName) {
  if (action === 'sync_policy') return 'mdm_action_sync_policy';
  if (action === 'recheck_compliance') return 'mdm_action_recheck_compliance';
  return 'mdm_action_enroll_device';
}

function enrollmentUrlFromEnv() {
  const text = String(process.env.MDM_ENROLLMENT_URL ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export async function POST(request: Request) {
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

  const inputRaw = await request.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const action = parsed.data.action;
  const upstream = await requestUpstreamMdmAction(user, action);
  if (upstream?.ok) {
    await writeMdmAudit(supabase, user.id, actionAuditType(action), {
      source: 'upstream',
      action,
      upstreamStatus: upstream.status,
      processedAt: new Date().toISOString(),
    });
    return NextResponse.json(upstream.payload, { headers: { 'x-mdm-source': 'upstream' } });
  }

  const enrollmentUrl = enrollmentUrlFromEnv();
  const message = defaultMessage(action);
  const metadata: Record<string, unknown> = {
    source: upstream ? 'local_fallback_after_upstream_error' : 'local',
    action,
    processedAt: new Date().toISOString(),
  };
  if (action === 'enroll_device') {
    metadata.enrollmentState = 'pending';
  }

  await writeMdmAudit(supabase, user.id, actionAuditType(action), {
    ...metadata,
  });

  return NextResponse.json(
    {
      ok: true,
      action,
      message,
      enrollmentUrl: action === 'enroll_device' ? enrollmentUrl : '',
      processedAt: new Date().toISOString(),
      source: upstream ? 'local_fallback_after_upstream_error' : 'local',
    },
    { headers: { 'x-mdm-source': upstream ? 'fallback_after_upstream_error' : 'local' } },
  );
}
