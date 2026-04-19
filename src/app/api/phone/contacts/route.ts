import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PHONE_CONTACTS } from '@/lib/phone-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ contacts: PHONE_CONTACTS });
}
