import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeletionRequestRow = {
  user_id: string;
  status: string;
  requested_at: string;
  recover_until: string;
  support_until: string;
  purge_at: string;
};

type PurgeResultRow = {
  user_id: string;
  purge_at: string;
  status: "purged" | "failed" | "planned";
  message: string;
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

async function detachUserReferences(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const operations = [
    admin.from("approval_requests").update({ reviewed_by: null }).eq("reviewed_by", userId),
    admin.from("audit_logs").update({ actor_user_id: null }).eq("actor_user_id", userId),
    admin.from("audit_logs").update({ target_user_id: null }).eq("target_user_id", userId),
  ];

  for (const op of operations) {
    const { error } = await op;
    if (error) return error.message;
  }
  return "";
}

async function runPurge(apply: boolean, maxBatch = 100) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const requestRes = await admin
    .from("account_deletion_requests")
    .select("user_id,status,requested_at,recover_until,support_until,purge_at")
    .eq("status", "pending")
    .lte("purge_at", nowIso)
    .order("purge_at", { ascending: true })
    .limit(maxBatch);

  if (requestRes.error) {
    return { error: requestRes.error.message, results: [] as PurgeResultRow[] };
  }

  const candidates = (requestRes.data ?? []) as DeletionRequestRow[];
  const results: PurgeResultRow[] = [];

  for (const row of candidates) {
    if (!apply) {
      results.push({
        user_id: row.user_id,
        purge_at: row.purge_at,
        status: "planned",
        message: "Eligible for purge",
      });
      continue;
    }

    const detachError = await detachUserReferences(admin, row.user_id);
    if (detachError) {
      results.push({
        user_id: row.user_id,
        purge_at: row.purge_at,
        status: "failed",
        message: `Detach references failed: ${detachError}`,
      });
      continue;
    }

    const deleted = await admin.auth.admin.deleteUser(row.user_id);
    const deleteMessage = String(deleted.error?.message ?? "");
    const userAlreadyGone =
      deleteMessage.toLowerCase().includes("not found") ||
      deleteMessage.toLowerCase().includes("user does not exist");

    if (deleted.error && !userAlreadyGone) {
      results.push({
        user_id: row.user_id,
        purge_at: row.purge_at,
        status: "failed",
        message: deleted.error.message,
      });
      continue;
    }

    const markPurged = await admin
      .from("account_deletion_requests")
      .update({
        status: "purged",
        updated_at: new Date().toISOString(),
        metadata_json: {
          purged_at: new Date().toISOString(),
          purged_by: "maintenance_cron",
          user_missing_before_delete: userAlreadyGone,
        },
      })
      .eq("user_id", row.user_id)
      .eq("status", "pending");

    if (markPurged.error) {
      results.push({
        user_id: row.user_id,
        purge_at: row.purge_at,
        status: "failed",
        message: `Marked purge failed: ${markPurged.error.message}`,
      });
      continue;
    }

    results.push({
      user_id: row.user_id,
      purge_at: row.purge_at,
      status: "purged",
      message: userAlreadyGone ? "User already removed. Marked as purged." : "Purged successfully.",
    });
  }

  const summary = results.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === "purged") acc.purged += 1;
      if (row.status === "failed") acc.failed += 1;
      if (row.status === "planned") acc.planned += 1;
      return acc;
    },
    { total: 0, purged: 0, failed: 0, planned: 0 },
  );

  return {
    error: "",
    mode: apply ? "apply" : "dry-run",
    asOf: nowIso,
    summary,
    results,
  };
}

export async function GET(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = String(searchParams.get("dryRun") ?? "").toLowerCase() !== "false";
  const maxBatchRaw = Number(searchParams.get("maxBatch") ?? 100);
  const maxBatch = Number.isFinite(maxBatchRaw) ? Math.max(1, Math.min(500, Math.floor(maxBatchRaw))) : 100;

  const summary = await runPurge(!dryRun, maxBatch);
  if (summary.error) {
    return NextResponse.json({ error: summary.error }, { status: 500 });
  }
  return NextResponse.json(summary);
}

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({})) as {
    apply?: boolean;
    maxBatch?: number;
  };
  const apply = Boolean(payload.apply);
  const maxBatchRaw = Number(payload.maxBatch ?? 100);
  const maxBatch = Number.isFinite(maxBatchRaw) ? Math.max(1, Math.min(500, Math.floor(maxBatchRaw))) : 100;

  const summary = await runPurge(apply, maxBatch);
  if (summary.error) {
    return NextResponse.json({ error: summary.error }, { status: 500 });
  }
  return NextResponse.json(summary);
}

