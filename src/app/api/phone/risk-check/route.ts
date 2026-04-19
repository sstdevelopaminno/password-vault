import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluatePhoneNumber } from '@/lib/phone-security';

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

  const result = evaluatePhoneNumber(parsed.data.number);
  return NextResponse.json({ result });
}
