import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluatePhoneRiskWithIntel } from '@/lib/phone-risk-intel';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const number = String(searchParams.get('number') ?? '').trim();
  if (!number) {
    return NextResponse.json({ error: 'number is required' }, { status: 400 });
  }

  const result = await evaluatePhoneRiskWithIntel(number, { includeWebSignals: true });

  return NextResponse.json({
    profile: {
      number: result.number,
      normalizedNumber: result.normalizedNumber,
      trustScore: Math.max(0, 100 - result.score),
      reportCount: result.intelligence.communityReports + result.intelligence.communityBlocks,
      callAttempts24h: result.level === 'high_risk' ? 8 : result.level === 'suspicious' ? 4 : 1,
      firstSeenAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastSeenAt: result.checkedAt,
      risk: {
        verdict: result.verdict,
        level: result.level,
        score: result.score,
        reasons: result.reasons,
      },
      intelligence: result.intelligence,
    },
  });
}
