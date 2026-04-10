import { NextResponse } from "next/server";
import { processPushQueue, type ProcessPushQueueSummary } from "@/lib/push-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBatch(value: string | null | undefined) {
  const num = Number(value ?? 30);
  if (!Number.isFinite(num)) return 30;
  return Math.min(100, Math.max(1, Math.floor(num)));
}

function parseMaxItems(value: string | null | undefined) {
  const num = Number(value ?? 300);
  if (!Number.isFinite(num)) return 300;
  return Math.min(5000, Math.max(1, Math.floor(num)));
}

function emptySummary(): ProcessPushQueueSummary {
  return {
    ok: true,
    fetched: 0,
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    errors: [],
  };
}

function mergeSummary(target: ProcessPushQueueSummary, next: ProcessPushQueueSummary) {
  target.ok = target.ok && next.ok;
  target.fetched += next.fetched;
  target.processed += next.processed;
  target.sent += next.sent;
  target.retried += next.retried;
  target.failed += next.failed;
  target.cancelled += next.cancelled;
  target.skipped += next.skipped;
  if (next.errors.length > 0) {
    target.errors.push(...next.errors);
  }
}

async function drainPushQueue(batchSize: number, maxItems: number) {
  const summary = emptySummary();
  let remaining = maxItems;

  while (remaining > 0) {
    const nextBatch = Math.min(batchSize, remaining);
    const round = await processPushQueue({ batchSize: nextBatch });
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
  const expected = String(process.env.PUSH_CRON_SECRET || process.env.CRON_SECRET || "").trim();
  if (!expected) return process.env.NODE_ENV !== "production";

  const viaHeader = String(req.headers.get("x-push-cron-secret") ?? "").trim();
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  return viaHeader === expected || bearer === expected;
}

export async function GET(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchSize = parseBatch(searchParams.get("batch"));
  const maxItems = parseMaxItems(searchParams.get("maxItems"));
  const summary = await drainPushQueue(batchSize, maxItems);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = parseBatch(String((body as { batchSize?: number }).batchSize ?? 30));
  const maxItems = parseMaxItems(String((body as { maxItems?: number }).maxItems ?? 300));
  const summary = await drainPushQueue(batchSize, maxItems);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
