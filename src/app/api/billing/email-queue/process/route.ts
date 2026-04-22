import { NextResponse } from 'next/server';
import { processBillingEmailJobs, type ProcessBillingEmailSummary } from '@/lib/billing-email-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseBatch(raw: string | null | undefined) {
  const value = Number(raw ?? 50);
  if (!Number.isFinite(value)) return 50;
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function parseMaxJobs(raw: string | null | undefined) {
  const value = Number(raw ?? 600);
  if (!Number.isFinite(value)) return 600;
  return Math.min(10000, Math.max(1, Math.floor(value)));
}

function emptySummary(): ProcessBillingEmailSummary {
  return {
    ok: true,
    fetched: 0,
    processed: 0,
    sent: 0,
    retried: 0,
    cancelled: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };
}

function mergeSummary(target: ProcessBillingEmailSummary, next: ProcessBillingEmailSummary) {
  target.ok = target.ok && next.ok;
  target.fetched += next.fetched;
  target.processed += next.processed;
  target.sent += next.sent;
  target.retried += next.retried;
  target.cancelled += next.cancelled;
  target.failed += next.failed;
  target.skipped += next.skipped;
  if (next.errors.length > 0) {
    target.errors.push(...next.errors);
  }
}

async function drainBillingJobs(batchSize: number, maxJobs: number) {
  const summary = emptySummary();
  let remaining = maxJobs;

  while (remaining > 0) {
    const nextBatch = Math.min(batchSize, remaining);
    const round = await processBillingEmailJobs({ batchSize: nextBatch });
    mergeSummary(summary, round);

    if (round.fetched === 0) break;
    if (round.processed === 0 && round.skipped >= round.fetched) break;
    remaining -= round.fetched;
  }

  if (summary.errors.length > 0) {
    summary.ok = false;
  }

  return summary;
}

function hasValidSecret(req: Request) {
  const expected = String(
    process.env.BILLING_EMAIL_CRON_SECRET ||
    process.env.CRON_SECRET ||
    process.env.NOTES_REMINDER_CRON_SECRET ||
    '',
  ).trim();
  if (!expected) return process.env.NODE_ENV !== 'production';

  const viaHeader = String(req.headers.get('x-billing-cron-secret') ?? '').trim();
  const authorization = String(req.headers.get('authorization') ?? '');
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';

  return viaHeader === expected || bearer === expected;
}

export async function GET(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchSize = parseBatch(searchParams.get('batch'));
  const maxJobs = parseMaxJobs(searchParams.get('maxJobs'));
  const summary = await drainBillingJobs(batchSize, maxJobs);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const batchSize = parseBatch(String((payload as { batchSize?: number }).batchSize ?? 50));
  const maxJobs = parseMaxJobs(String((payload as { maxJobs?: number }).maxJobs ?? 600));
  const summary = await drainBillingJobs(batchSize, maxJobs);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
