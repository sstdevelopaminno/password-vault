import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAccessibleUserIds } from '@/lib/user-identity';

const paymentSchema = z.object({
  paid: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await req.json().catch(() => ({}));
  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });

  const nowIso = new Date().toISOString();
  const nextStatus = parsed.data.paid ? 'paid' : 'unpaid';
  const updated = await admin
    .from('billing_documents')
    .update({
      payment_status: nextStatus,
      paid_at: parsed.data.paid ? nowIso : null,
      updated_at: nowIso,
    })
    .eq('id', id)
    .in('user_id', ownerIds)
    .select('id,payment_status,paid_at,updated_at')
    .maybeSingle();

  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 400 });
  }
  if (!updated.data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (parsed.data.paid) {
    await admin
      .from('billing_email_jobs')
      .update({
        status: 'cancelled',
        updated_at: nowIso,
        last_error: 'Cancelled after marked paid',
      })
      .eq('billing_document_id', id)
      .in('status', ['pending', 'processing'])
      .in('job_type', ['due_before', 'due_after', 'monthly']);
  }

  return NextResponse.json({
    document: {
      id: updated.data.id,
      paymentStatus: updated.data.payment_status,
      paidAt: updated.data.paid_at,
      updatedAt: updated.data.updated_at,
    },
  });
}
