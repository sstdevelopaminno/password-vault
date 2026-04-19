import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluatePhoneRiskWithIntel } from '@/lib/phone-risk-intel';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  number: z.string().trim().min(6).max(30),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const risk = await evaluatePhoneRiskWithIntel(parsed.data.number, { includeWebSignals: false });
  const allowDirectDial = risk.recommendedAction !== 'block';

  return NextResponse.json({
    dial: {
      allowDirectDial,
      suggestedMode: allowDirectDial ? 'normal' : 'blocked',
      message: allowDirectDial ? 'สามารถโทรออกได้' : 'ระบบแนะนำให้บล็อกหมายเลขนี้',
      risk,
    },
  });
}
