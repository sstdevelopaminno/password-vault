import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/app-version";
import { getDefaultAndroidReleasePayload } from "@/lib/android-apk-release";
import {
  UPDATE_DETAILS_PATH,
  getReleaseUpdateDetail,
  getReleaseUpdateMessage,
  getReleaseUpdateTitle,
} from "@/lib/release-update";
import { enqueuePushNotification, processPushQueue, type ProcessPushQueueSummary } from "@/lib/push-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BroadcastBody = {
  locale?: "th" | "en";
  processNow?: boolean;
  href?: string;
  maxUsers?: number;
  batchSize?: number;
  maxItems?: number;
};

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function hasValidSecret(req: Request) {
  const expected = String(process.env.PUSH_CRON_SECRET || process.env.CRON_SECRET || "").trim();
  if (!expected) return process.env.NODE_ENV !== "production";

  const viaHeader = String(req.headers.get("x-push-cron-secret") ?? "").trim();
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";

  return viaHeader === expected || bearer === expected;
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
    const round = await processPushQueue({ batchSize: Math.min(batchSize, remaining) });
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

export async function POST(req: Request) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as BroadcastBody;
  const locale = body.locale === "en" ? "en" : "th";
  const href = String(body.href || UPDATE_DETAILS_PATH).trim() || UPDATE_DETAILS_PATH;
  const maxUsers = parsePositiveInt(body.maxUsers, 3000, 1, 10000);
  const batchSize = parsePositiveInt(body.batchSize, 30, 1, 100);
  const maxItems = parsePositiveInt(body.maxItems, 300, 1, 5000);
  const processNow = body.processNow !== false;

  const release = getDefaultAndroidReleasePayload().release;
  const title = getReleaseUpdateTitle(locale);
  const message = getReleaseUpdateMessage(locale);
  const details = getReleaseUpdateDetail(locale);
  const updateTag = `pv-system-update-${APP_VERSION.toLowerCase()}`;

  const admin = createAdminClient();
  const usersQuery = await admin
    .from("push_subscriptions")
    .select("user_id")
    .eq("is_active", true)
    .not("user_id", "is", null)
    .limit(maxUsers);

  if (usersQuery.error) {
    return NextResponse.json({ error: usersQuery.error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (usersQuery.data || [])
        .map((row) => String((row as { user_id?: string }).user_id || "").trim())
        .filter(Boolean),
    ),
  );

  const queueErrors: string[] = [];
  let queued = 0;

  for (const userId of userIds) {
    const result = await enqueuePushNotification({
      userId,
      kind: "system",
      title,
      message,
      href,
      tag: updateTag,
      payload: {
        details,
        appVersion: APP_VERSION,
        updateKind: "system-release",
        targets: ["pwa", "apk"],
        apk: {
          versionName: release.versionName,
          versionCode: release.versionCode,
          downloadUrl: release.downloadUrl,
          packageName: release.packageName,
          publishedAt: release.publishedAt,
        },
      },
      priority: 9,
    });

    if (result.ok) {
      queued += 1;
      continue;
    }
    queueErrors.push(`${userId}: ${result.error}`);
  }

  const processSummary = processNow ? await drainPushQueue(batchSize, maxItems) : null;
  const ok = queueErrors.length === 0 && (processSummary ? processSummary.ok : true);
  const status = ok ? 200 : 500;

  return NextResponse.json(
    {
      ok,
      appVersion: APP_VERSION,
      apkVersion: release.versionName,
      queued,
      targetUsers: userIds.length,
      queueErrors: queueErrors.slice(0, 20),
      processSummary,
    },
    { status },
  );
}
