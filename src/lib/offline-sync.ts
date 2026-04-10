import type { PinAction } from "@/lib/pin";
import {
  clearOfflineQueue,
  enqueueOfflineRequest,
  getOfflineQueueStats,
  listOfflineQueue,
  removeOfflineQueueItem,
  type OfflineQueueItem,
} from "@/lib/offline-store";

export type OfflineQueueResult = {
  processed: number;
  failed: number;
  processedIds: string[];
  failedIds: string[];
};

type QueueOptions = {
  feature?: "vault" | "notes" | "system";
  label?: string;
  pinReverify?: {
    pin: string;
    action: PinAction;
    targetItemId?: string;
  };
};

export async function queueOfflineRequest(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
  options?: QueueOptions,
) {
  await enqueueOfflineRequest({
    url,
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    meta: options
      ? {
          feature: options.feature,
          label: options.label,
          pinReverify: options.pinReverify,
        }
      : undefined,
  });
}

async function issuePinAssertion(item: OfflineQueueItem) {
  const pin = item.meta?.pinReverify;
  if (!pin) return null;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pin.pin,
          action: pin.action,
          targetItemId: pin.targetItemId,
        }),
      });
      if (!res.ok) {
        if (attempt >= maxAttempts) return null;
        await sleepWithBackoff(attempt);
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as { assertionToken?: string };
      return body.assertionToken ?? null;
    } catch {
      if (attempt >= maxAttempts) return null;
      await sleepWithBackoff(attempt);
    }
  }
  return null;
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function backoffDelayMs(attempt: number) {
  const base = Math.min(4000, 300 * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 220);
  return base + jitter;
}

function sleepWithBackoff(attempt: number) {
  return new Promise<void>(function (resolve) {
    window.setTimeout(resolve, backoffDelayMs(attempt));
  });
}

type FlushOptions = {
  onlyIds?: string[];
};

export async function flushOfflineQueue(options?: FlushOptions): Promise<OfflineQueueResult> {
  const items = await listOfflineQueue();
  const onlyIds = new Set(options?.onlyIds ?? []);
  const targetItems = onlyIds.size > 0 ? items.filter((item) => onlyIds.has(item.id)) : items;
  let processed = 0;
  let failed = 0;
  const processedIds: string[] = [];
  const failedIds: string[] = [];

  for (const item of targetItems) {
    try {
      const headers = { ...(item.headers ?? {}) };
      if (item.meta?.pinReverify) {
        const assertionToken = await issuePinAssertion(item);
        if (!assertionToken) {
          failed += 1;
          failedIds.push(item.id);
          continue;
        }
        headers["x-pin-assertion"] = assertionToken;
      }
      const maxAttempts = 4;
      let succeeded = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers: headers,
            body: item.body,
          });
          if (!res.ok) {
            const retryable = shouldRetryStatus(res.status) && attempt < maxAttempts;
            if (retryable) {
              await sleepWithBackoff(attempt);
              continue;
            }
            break;
          }
          succeeded = true;
          break;
        } catch {
          if (attempt < maxAttempts) {
            await sleepWithBackoff(attempt);
            continue;
          }
          break;
        }
      }
      if (!succeeded) {
        failed += 1;
        failedIds.push(item.id);
        continue;
      }
      await removeOfflineQueueItem(item.id);
      processed += 1;
      processedIds.push(item.id);
    } catch {
      failed += 1;
      failedIds.push(item.id);
    }
  }

  return { processed, failed, processedIds, failedIds };
}

export async function getOfflineQueueItems() {
  return listOfflineQueue();
}

export async function purgeOfflineQueue() {
  await clearOfflineQueue();
}

export async function getOfflineQueueSummary() {
  return getOfflineQueueStats();
}

export type OfflineRecoverySelfTestResult = {
  passed: boolean;
  firstRun: OfflineQueueResult;
  secondRun: OfflineQueueResult;
  queuedId: string;
  queueAfter: {
    total: number;
    unlocked: number;
    locked: number;
  };
};

function asUrlPath(input: RequestInfo | URL) {
  if (typeof input === "string") {
    try {
      return new URL(input, window.location.origin).pathname;
    } catch {
      return input;
    }
  }
  if (input instanceof URL) return input.pathname;
  return input.url;
}

export async function runOfflineRecoverySelfTest(): Promise<OfflineRecoverySelfTestResult> {
  const marker = "offline_recovery_self_test_" + Date.now().toString(36);
  await queueOfflineRequest(
    "/api/runtime/diagnostics",
    "POST",
    {
      event: "offline_recovery_self_test",
      note: marker,
    },
    { "Content-Type": "application/json" },
    {
      feature: "system",
      label: "Offline recovery self-test",
    },
  );

  const queue = await listOfflineQueue();
  const queued = queue.find(function (item) {
    if (item.url !== "/api/runtime/diagnostics") return false;
    if (!item.body) return false;
    return item.body.includes(marker);
  });
  if (!queued) {
    throw new Error("Unable to locate queued self-test item");
  }

  const realFetch = globalThis.fetch.bind(globalThis);
  let forceFailure = true;
  globalThis.fetch = (async function (input: RequestInfo | URL, init?: RequestInit) {
    const path = asUrlPath(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    const isTarget = path === "/api/runtime/diagnostics" && method === "POST" && body.includes(marker);
    if (isTarget && forceFailure) {
      throw new Error("Simulated network outage for self-test");
    }
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    const firstRun = await flushOfflineQueue({ onlyIds: [queued.id] });
    forceFailure = false;
    const secondRun = await flushOfflineQueue({ onlyIds: firstRun.failedIds });
    const queueAfter = await getOfflineQueueSummary();
    const passed = firstRun.failed >= 1 && secondRun.processed >= 1;
    return {
      passed: passed,
      firstRun: firstRun,
      secondRun: secondRun,
      queuedId: queued.id,
      queueAfter: queueAfter,
    };
  } finally {
    globalThis.fetch = realFetch;
  }
}
