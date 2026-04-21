import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CleanupRow = {
  table_name: string;
  deleted_rows: number;
  dry_run: boolean;
};

function hasValidSecret(req: Request) {
  const expected = String(
    process.env.MAINTENANCE_CRON_SECRET ||
    process.env.CRON_SECRET ||
    process.env.PUSH_CRON_SECRET ||
    "",
  ).trim();
  if (!expected) return process.env.NODE_ENV !== "production";

  const viaHeader = String(req.headers.get("x-maintenance-cron-secret") ?? "").trim();
  const authorization = String(req.headers.get("authorization") ?? "");
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  return viaHeader === expected || bearer === expected;
}

async function runCleanup(apply: boolean) {
  const admin = createAdminClient();
  const result = await admin.rpc("cleanup_operational_data", { p_apply: apply });
  if (result.error) {
    return { error: result.error.message, rows: [] as CleanupRow[] };
  }

  const rows = (Array.isArray(result.data) ? result.data : []) as CleanupRow[];
  const total = rows.reduce(function (sum, row) {
    return sum + Number(row.deleted_rows ?? 0);
  }, 0);

  return {
    error: "",
    rows,
    total,
    mode: apply ? "apply" : "dry-run",
  };
}

export async function GET(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = String(searchParams.get("dryRun") ?? "").toLowerCase() === "true";
  const summary = await runCleanup(!dryRun);
  if (summary.error) {
    return NextResponse.json({ error: summary.error }, { status: 500 });
  }
  return NextResponse.json(summary);
}

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(function () {
    return {};
  });
  const apply = Boolean((payload as { apply?: boolean }).apply);
  const summary = await runCleanup(apply);
  if (summary.error) {
    return NextResponse.json({ error: summary.error }, { status: 500 });
  }
  return NextResponse.json(summary);
}

