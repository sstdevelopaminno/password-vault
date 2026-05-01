import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, resolveProfileForAuthUser } from '@/lib/supabase/admin';
import { mergePinPolicy, normalizePinPolicy, PIN_POLICY_EDITABLE_ACTIONS } from '@/lib/pin-policy';
import type { PinAction } from '@/lib/pin';

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email,
    fullName: String(auth.user.user_metadata?.full_name ?? ''),
  });

  const policy = normalizePinPolicy((resolved.profile as { pin_policy_json?: unknown }).pin_policy_json);
  return NextResponse.json({ policy, editableActions: PIN_POLICY_EDITABLE_ACTIONS });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const patchRaw = (payload as { policy?: unknown }).policy;
  if (!patchRaw || typeof patchRaw !== 'object') {
    return NextResponse.json({ error: 'Invalid policy payload' }, { status: 400 });
  }

  const patchObj = patchRaw as Partial<Record<PinAction, unknown>>;
  const patch: Partial<Record<PinAction, boolean>> = {};
  for (const key of PIN_POLICY_EDITABLE_ACTIONS) {
    const value = patchObj[key];
    if (typeof value === 'boolean') {
      patch[key] = value;
    }
  }

  const admin = createAdminClient();
  const resolved = await resolveProfileForAuthUser({
    userId: auth.user.id,
    email: auth.user.email,
    fullName: String(auth.user.user_metadata?.full_name ?? ''),
  });

  const current = normalizePinPolicy((resolved.profile as { pin_policy_json?: unknown }).pin_policy_json);
  const merged = mergePinPolicy(current, patch, true);

  const { error } = await admin
    .from('profiles')
    .update({ pin_policy_json: merged, updated_at: new Date().toISOString() })
    .eq('id', resolved.profile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policy: merged, editableActions: PIN_POLICY_EDITABLE_ACTIONS });
}
