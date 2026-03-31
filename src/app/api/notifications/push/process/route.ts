import { NextResponse } from "next/server";
import { processPushQueue } from "@/lib/push-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBatch(value: string | null | undefined) {
  const num = Number(value ?? 30);
  if (!Number.isFinite(num)) return 30;
  return Math.min(100, Math.max(1, Math.floor(num)));
}

function hasValidSecret(req: Request) {
  const expected = process.env.PUSH_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!expected) return process.env.NODE_ENV !== "production";

  const viaHeader = req.headers.get("x-push-cron-secret") ?? "";
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
  const summary = await processPushQueue({ batchSize });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = parseBatch(String((body as { batchSize?: number }).batchSize ?? 30));
  const summary = await processPushQueue({ batchSize });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
