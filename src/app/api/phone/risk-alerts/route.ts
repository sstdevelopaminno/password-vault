import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  evaluatePhoneRiskWithIntel,
  listRiskAlertsWithIntel,
  normalizePhoneForStorage,
} from '@/lib/phone-risk-intel';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  number: z.string().trim().min(6).max(30),
  action: z.enum(['block', 'report']),
});

function isMissingPhoneRiskTableError(message: unknown) {
  const text = String(message ?? '').toLowerCase();
  return text.includes('phone_risk_actions') && (text.includes('does not exist') || text.includes('not found'));
}

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const alerts = await listRiskAlertsWithIntel(30);
  const summary = {
    total: alerts.length,
    highRiskCount: alerts.filter((alert) => alert.level === 'high_risk').length,
    suspiciousCount: alerts.filter((alert) => alert.level === 'suspicious').length,
  };

  return NextResponse.json({
    alerts,
    summary,
    persistenceReady: true,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const risk = await evaluatePhoneRiskWithIntel(parsed.data.number, { includeWebSignals: false });
  const normalized = normalizePhoneForStorage(parsed.data.number);

  let persisted = false;
  const withNormalized = await supabase.from('phone_risk_actions').insert({
    user_id: data.user.id,
    phone_number: parsed.data.number,
    normalized_number: normalized,
    action: parsed.data.action,
    risk_level: risk.level,
  });

  if (!withNormalized.error) {
    persisted = true;
  } else if (String(withNormalized.error.message ?? '').toLowerCase().includes('normalized_number')) {
    const withoutNormalized = await supabase.from('phone_risk_actions').insert({
      user_id: data.user.id,
      phone_number: parsed.data.number,
      action: parsed.data.action,
      risk_level: risk.level,
    });

    if (!withoutNormalized.error) {
      persisted = true;
    } else if (!isMissingPhoneRiskTableError(withoutNormalized.error.message)) {
      return NextResponse.json({ error: withoutNormalized.error.message }, { status: 400 });
    }
  } else if (!isMissingPhoneRiskTableError(withNormalized.error.message)) {
    return NextResponse.json({ error: withNormalized.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    number: parsed.data.number,
    action: parsed.data.action,
    riskLevel: risk.level,
    processedAt: new Date().toISOString(),
    persisted,
  });
}
