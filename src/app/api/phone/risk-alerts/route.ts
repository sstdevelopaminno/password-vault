import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluatePhoneNumber, listRiskAlerts } from '@/lib/phone-security';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  number: z.string().trim().min(6).max(30),
  action: z.enum(['block', 'report']),
});

type StoredActionRow = {
  id: number;
  phone_number: string;
  action: 'block' | 'report';
  risk_level: 'safe' | 'suspicious' | 'high_risk';
  created_at: string;
};

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

  const seededAlerts = listRiskAlerts();

  const { data: actionRows, error } = await supabase
    .from('phone_risk_actions')
    .select('id,phone_number,action,risk_level,created_at')
    .eq('user_id', data.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error && !isMissingPhoneRiskTableError(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userAlerts = ((actionRows ?? []) as StoredActionRow[]).map((row) => ({
    id: `u-${row.id}`,
    number: row.phone_number,
    level: row.risk_level,
    message: row.action === 'block' ? 'ผู้ใช้บล็อกหมายเลขนี้แล้ว' : 'ผู้ใช้รายงานหมายเลขนี้แล้ว',
    detectedAt: row.created_at,
    reports: row.action === 'report' ? 1 : 0,
  }));

  const merged = [...userAlerts, ...seededAlerts]
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, 30);

  const highRiskCount = merged.filter((alert) => alert.level === 'high_risk').length;

  return NextResponse.json({
    alerts: merged,
    summary: {
      total: merged.length,
      highRiskCount,
      suspiciousCount: merged.filter((alert) => alert.level === 'suspicious').length,
    },
    persistenceReady: !error || !isMissingPhoneRiskTableError(error.message),
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

  const risk = evaluatePhoneNumber(parsed.data.number);

  const { error } = await supabase.from('phone_risk_actions').insert({
    user_id: data.user.id,
    phone_number: parsed.data.number,
    action: parsed.data.action,
    risk_level: risk.level,
  });

  if (error && !isMissingPhoneRiskTableError(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    number: parsed.data.number,
    action: parsed.data.action,
    riskLevel: risk.level,
    processedAt: new Date().toISOString(),
    persisted: !error || !isMissingPhoneRiskTableError(error.message),
  });
}
