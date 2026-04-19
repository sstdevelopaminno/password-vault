import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluatePhoneRiskWithIntel } from '@/lib/phone-risk-intel';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  number: z.string().trim().min(6).max(30),
  telemetrySignals: z
    .object({
      numberInContacts: z.boolean().optional(),
      spamLikeCallPattern: z.boolean().optional(),
      networkOrSimAnomaly: z.boolean().optional(),
      frequentSimChanges: z.boolean().optional(),
      abnormalSignalOrCellInfo: z.boolean().optional(),
      riskyVoipOrRelayApps: z.boolean().optional(),
      rootedOrTamperedOrSideloaded: z.boolean().optional(),
      gatewayOrMassCallingBehavior: z.boolean().optional(),
      suspiciousCallAttempts1h: z.number().int().min(0).max(500).optional(),
      outboundCalls24h: z.number().int().min(0).max(5000).optional(),
      distinctCallees24h: z.number().int().min(0).max(5000).optional(),
    })
    .optional(),
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

  const result = await evaluatePhoneRiskWithIntel(parsed.data.number, {
    includeWebSignals: true,
    telemetrySignals: parsed.data.telemetrySignals,
  });
  return NextResponse.json({ result });
}
