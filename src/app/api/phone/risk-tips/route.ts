import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type TipWorkflowStatus = 'pending_review' | 'reviewing' | 'approved_notify' | 'closed' | 'unknown';

type TipRow = {
  id: number;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

function normalizeStatus(value: unknown): TipWorkflowStatus {
  const text = String(value ?? '').toLowerCase().trim();
  if (text === 'pending_review') return 'pending_review';
  if (text === 'reviewing') return 'reviewing';
  if (text === 'approved_notify') return 'approved_notify';
  if (text === 'closed') return 'closed';
  return 'unknown';
}

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from('audit_logs')
    .select('id,created_at,metadata_json')
    .eq('actor_user_id', data.user.id)
    .eq('action_type', 'phone_risk_tip_reported')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const tips = ((rows ?? []) as TipRow[]).map((row) => {
    const metadata = (row.metadata_json ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id),
      number: String(metadata.number ?? ''),
      normalizedNumber: String(metadata.normalizedNumber ?? ''),
      clueText: String(metadata.clueText ?? ''),
      riskLevel: String(metadata.riskLevel ?? 'unknown'),
      source: String(metadata.source ?? 'manual_tip'),
      workflowStatus: normalizeStatus(metadata.workflowStatus ?? 'pending_review'),
      createdAt: row.created_at,
      updatedAt: String(metadata.updatedAt ?? row.created_at),
      persisted: Boolean(metadata.persisted),
    };
  });

  const summary = {
    total: tips.length,
    pendingReview: tips.filter((tip) => tip.workflowStatus === 'pending_review').length,
    reviewing: tips.filter((tip) => tip.workflowStatus === 'reviewing').length,
    approvedNotify: tips.filter((tip) => tip.workflowStatus === 'approved_notify').length,
    closed: tips.filter((tip) => tip.workflowStatus === 'closed').length,
  };

  return NextResponse.json({ tips, summary });
}

