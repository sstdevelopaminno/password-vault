import { NextResponse } from 'next/server';
import { verifyPinAssertionToken, type PinAction } from '@/lib/pin';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPinRequiredForAction, normalizePinPolicy } from '@/lib/pin-policy';

export async function requirePinAssertion(input: {
  request: Request;
  userId: string;
  action: PinAction;
  targetItemId?: string;
}) {
  let pinRequired = true;
  try {
    const admin = createAdminClient();
    const policyQuery = await admin.from('profiles').select('pin_policy_json').eq('id', input.userId).maybeSingle();
    if (!policyQuery.error) {
      const policy = normalizePinPolicy((policyQuery.data as { pin_policy_json?: unknown } | null)?.pin_policy_json);
      pinRequired = isPinRequiredForAction(policy, input.action);
    }
  } catch {
    pinRequired = true;
  }

  if (!pinRequired) {
    return { ok: true as const };
  }

  const token = input.request.headers.get('x-pin-assertion');
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'PIN verification required' }, { status: 403 }),
    };
  }

  const ok = verifyPinAssertionToken(token, {
    userId: input.userId,
    action: input.action,
    targetItemId: input.targetItemId,
  });

  if (!ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid PIN assertion' }, { status: 403 }),
    };
  }

  return { ok: true as const };
}
