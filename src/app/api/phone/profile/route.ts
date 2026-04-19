import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPhoneProfile } from '@/lib/phone-security';

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

  return NextResponse.json({ profile: buildPhoneProfile(number) });
}
