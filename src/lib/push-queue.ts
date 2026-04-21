import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type QueueStatus = "pending" | "processing" | "sent" | "failed" | "cancelled";

type PushQueueRow = {
  id: number;
  user_id: string;
  notification_kind: string;
  title: string;
  body: string;
  href: string | null;
  image_url: string | null;
  tag: string | null;
  payload_json: Record<string, unknown> | null;
  priority: number;
  status: QueueStatus;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

export type EnqueuePushNotificationInput = {
  userId: string;
  kind?: "system" | "security" | "auth" | "vault" | "general";
  title: string;
  message: string;
  href?: string;
  imageUrl?: string;
  tag?: string;
  priority?: number;
  scheduledAt?: string;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
};

export type ProcessPushQueueSummary = {
  ok: boolean;
  fetched: number;
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  skipped: number;
  errors: string[];
};

type ProcessPushQueueOptions = {
  batchSize?: number;
};

type ProcessOutcome = {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  skipped: number;
  errors: string[];
};

let vapidConfigured = false;
const DEFAULT_PUSH_TTL_SEC = 60 * 60 * 24; // 24h

function clampPriority(input: number | undefined) {
  const value = Number(input ?? 5);
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function clampAttempts(input: number | undefined) {
  const value = Number(input ?? 5);
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function plusSecondsIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? "Unknown error");
}

function getPushTtlSeconds() {
  const raw = Number(process.env.PUSH_NOTIFICATION_TTL_SECONDS ?? DEFAULT_PUSH_TTL_SEC);
  if (!Number.isFinite(raw)) return DEFAULT_PUSH_TTL_SEC;
  return Math.min(60 * 60 * 24 * 7, Math.max(60, Math.floor(raw)));
}

function getVapidPublicKey() {
  return String(
    process.env.PUSH_VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    ""
  ).trim();
}

function getVapidPrivateKey() {
  return String(process.env.PUSH_VAPID_PRIVATE_KEY || "").trim();
}

function getVapidSubject() {
  return String(process.env.PUSH_VAPID_SUBJECT || "mailto:security@password-vault.local").trim();
}

function ensureWebPushConfigured() {
  if (vapidConfigured) return true;
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(getVapidSubject(), publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function isGoneStatus(statusCode: number | undefined) {
  return statusCode === 404 || statusCode === 410;
}

function isRetryableStatus(statusCode: number | undefined) {
  if (statusCode == null) return true;
  if (statusCode === 429) return true;
  return statusCode >= 500;
}

export async function enqueuePushNotification(input: EnqueuePushNotificationInput) {
  if (!input.userId || !input.title || !input.message) {
    return { ok: false as const, error: "Missing required push queue input" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_notification_queue")
    .insert({
      user_id: input.userId,
      notification_kind: input.kind ?? "general",
      title: input.title,
      body: input.message,
      href: input.href ?? null,
      image_url: input.imageUrl ?? null,
      tag: input.tag ?? null,
      payload_json: input.payload ?? {},
      priority: clampPriority(input.priority),
      max_attempts: clampAttempts(input.maxAttempts),
      scheduled_at: input.scheduledAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, id: Number(data?.id ?? 0) };
}

async function processQueueRow(row: PushQueueRow): Promise<ProcessOutcome> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const nextAttempt = row.attempt_count + 1;

  const claimed = await admin
    .from("push_notification_queue")
    .update({
      status: "processing",
      attempt_count: nextAttempt,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimed.error) {
    return {
      processed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      errors: [claimed.error.message],
    };
  }

  if (!claimed.data) {
    return {
      processed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: 0,
      skipped: 1,
      errors: [],
    };
  }

  if (!ensureWebPushConfigured()) {
    await admin
      .from("push_notification_queue")
      .update({
        status: "failed",
        processed_at: nowIso,
        last_error: "Missing PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY",
        updated_at: nowIso,
      })
      .eq("id", row.id);

    return {
      processed: 1,
      sent: 0,
      retried: 0,
      failed: 1,
      cancelled: 0,
      skipped: 0,
      errors: [],
    };
  }

  const subscriptionQuery = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh_key,auth_key")
    .eq("user_id", row.user_id)
    .eq("is_active", true);

  if (subscriptionQuery.error) {
    await admin
      .from("push_notification_queue")
      .update({
        status: "failed",
        processed_at: nowIso,
        last_error: subscriptionQuery.error.message,
        updated_at: nowIso,
      })
      .eq("id", row.id);

    return {
      processed: 1,
      sent: 0,
      retried: 0,
      failed: 1,
      cancelled: 0,
      skipped: 0,
      errors: [],
    };
  }

  const subscriptions = (subscriptionQuery.data ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) {
    await admin
      .from("push_notification_queue")
      .update({
        status: "cancelled",
        processed_at: nowIso,
        last_error: "No active subscription",
        updated_at: nowIso,
      })
      .eq("id", row.id);

    return {
      processed: 1,
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: 1,
      skipped: 0,
      errors: [],
    };
  }

  const extraPayload = row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
  const payload = JSON.stringify({
    title: row.title,
    body: row.body,
    href: row.href ?? "/home",
    image: row.image_url ?? undefined,
    tag: row.tag ?? `pv-queue-${row.id}`,
    ...extraPayload,
  });

  const staleSubscriptionIds: string[] = [];
  let successCount = 0;
  let retryableFailure = false;
  const failureReasons: string[] = [];

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh_key,
            auth: subscription.auth_key,
          },
        },
        payload,
        { TTL: getPushTtlSeconds() },
      );
      successCount += 1;
    } catch (error) {
      const maybeWebPush = error as { statusCode?: number; body?: unknown; message?: string };
      const statusCode = Number(maybeWebPush.statusCode ?? 0) || undefined;
      const reason = String(maybeWebPush.body ?? maybeWebPush.message ?? normalizeError(error));
      failureReasons.push(statusCode ? `${statusCode}:${reason}` : reason);

      if (isGoneStatus(statusCode)) {
        staleSubscriptionIds.push(subscription.id);
      } else if (isRetryableStatus(statusCode)) {
        retryableFailure = true;
      }
    }
  }

  if (staleSubscriptionIds.length > 0) {
    await admin
      .from("push_subscriptions")
      .update({ is_active: false, updated_at: nowIso })
      .in("id", staleSubscriptionIds);
  }

  if (successCount > 0) {
    await admin
      .from("push_notification_queue")
      .update({
        status: "sent",
        processed_at: nowIso,
        updated_at: nowIso,
        last_error: failureReasons.length > 0 ? failureReasons.slice(0, 2).join(" | ") : null,
      })
      .eq("id", row.id);

    return {
      processed: 1,
      sent: 1,
      retried: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      errors: [],
    };
  }

  if (retryableFailure && nextAttempt < row.max_attempts) {
    const backoffSec = Math.min(300, 20 * nextAttempt);
    await admin
      .from("push_notification_queue")
      .update({
        status: "pending",
        scheduled_at: plusSecondsIso(backoffSec),
        updated_at: nowIso,
        last_error: failureReasons.slice(0, 2).join(" | "),
      })
      .eq("id", row.id);

    return {
      processed: 1,
      sent: 0,
      retried: 1,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      errors: [],
    };
  }

  await admin
    .from("push_notification_queue")
    .update({
      status: "failed",
      processed_at: nowIso,
      updated_at: nowIso,
      last_error: failureReasons.slice(0, 2).join(" | ") || "Push delivery failed",
    })
    .eq("id", row.id);

  return {
    processed: 1,
    sent: 0,
    retried: 0,
    failed: 1,
    cancelled: 0,
    skipped: 0,
    errors: [],
  };
}

export async function processPushQueue(options?: ProcessPushQueueOptions): Promise<ProcessPushQueueSummary> {
  const batchSize = Math.min(100, Math.max(1, Number(options?.batchSize ?? 30)));
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const selected = await admin
    .from("push_notification_queue")
    .select("id,user_id,notification_kind,title,body,href,image_url,tag,payload_json,priority,status,attempt_count,max_attempts,scheduled_at")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(batchSize);

  if (selected.error) {
    return {
      ok: false,
      fetched: 0,
      processed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      errors: [selected.error.message],
    };
  }

  const rows = (selected.data ?? []) as PushQueueRow[];
  const summary: ProcessPushQueueSummary = {
    ok: true,
    fetched: rows.length,
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    const outcome = await processQueueRow(row);
    summary.processed += outcome.processed;
    summary.sent += outcome.sent;
    summary.retried += outcome.retried;
    summary.failed += outcome.failed;
    summary.cancelled += outcome.cancelled;
    summary.skipped += outcome.skipped;
    if (outcome.errors.length > 0) {
      summary.errors.push(...outcome.errors);
    }
  }

  if (summary.errors.length > 0) {
    summary.ok = false;
  }

  return summary;
}
