type MetricSample = {
 ts: number;
 durationMs: number;
 status: number;
};

type MetricBucket = {
 key: string;
 route: string;
 method: string;
 lifetimeRequests: number;
 lifetimeErrors: number;
 lastStatus: number;
 lastAt: number;
 samples: MetricSample[];
};

const STARTED_AT = Date.now();
const KEEP_MS = 5 * 60 * 1000;
const MAX_SAMPLES = 20000;
const buckets: Map<string, MetricBucket> = new Map();

function clampWindowSec(input: number) {
 if (!Number.isFinite(input)) return 60;
 const safe = Math.floor(input);
 if (safe < 10) return 10;
 if (safe > 300) return 300;
 return safe;
}

function prune(bucket: MetricBucket, now: number) {
 const cutoff = now - KEEP_MS;
 while (bucket.samples.length > 0 && bucket.samples[0].ts < cutoff) {
 bucket.samples.shift();
 }
 if (bucket.samples.length > MAX_SAMPLES) {
 bucket.samples.splice(0, bucket.samples.length - MAX_SAMPLES);
 }
}

function percentile95(values: number[]) {
 if (values.length === 0) return 0;
 const sorted = values.slice().sort((a, b) => a - b);
 const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
 return sorted[Math.min(idx, sorted.length - 1)];
}

export function recordApiMetric(route: string, method: string, status: number, durationMs: number) {
 const now = Date.now();
 const key = method.toUpperCase() + ' ' + route;
 const hit = buckets.get(key);

 if (!hit) {
 buckets.set(key, {
 key,
 route,
 method: method.toUpperCase(),
 lifetimeRequests: 1,
 lifetimeErrors: status >= 400 ? 1 : 0,
 lastStatus: status,
 lastAt: now,
 samples: [{ ts: now, durationMs, status }],
 });
 return;
 }

 hit.lifetimeRequests += 1;
 if (status >= 400) hit.lifetimeErrors += 1;
 hit.lastStatus = status;
 hit.lastAt = now;
 hit.samples.push({ ts: now, durationMs, status });
 prune(hit, now);
}

export function resetApiMetrics() {
 buckets.clear();
}

export function getApiMetricsSnapshot(windowSecInput = 60, routeFilter = '') {
 const now = Date.now();
 const windowSec = clampWindowSec(windowSecInput);
 const cutoff = now - windowSec * 1000;
 const filter = routeFilter.trim().toLowerCase();

 const routes: Array<Record<string, unknown>> = [];
 let globalRequests = 0;
 let globalErrors = 0;
 let globalLatencySum = 0;
 const p95Pool: number[] = [];

 for (const bucket of buckets.values()) {
 if (filter && !bucket.key.toLowerCase().includes(filter) && !bucket.route.toLowerCase().includes(filter)) continue;

 prune(bucket, now);
 const inWindow = bucket.samples.filter((sample) => sample.ts >= cutoff);
 const requests = inWindow.length;
 const errors = inWindow.filter((sample) => sample.status >= 400).length;
 const latencies = inWindow.map((sample) => sample.durationMs);
 const latencySum = latencies.reduce((sum, item) => sum + item, 0);
 const p95 = percentile95(latencies);

 globalRequests += requests;
 globalErrors += errors;
 globalLatencySum += latencySum;
 p95Pool.push(p95);

 routes.push({
 key: bucket.key,
 route: bucket.route,
 method: bucket.method,
 requests,
 throughputRps: Number((requests / windowSec).toFixed(2)),
 avgLatencyMs: requests === 0 ? 0 : Number((latencySum / requests).toFixed(2)),
 p95LatencyMs: Number(p95.toFixed(2)),
 errorRate: requests === 0 ? 0 : Number(((errors / requests) * 100).toFixed(2)),
 errors,
 lastStatus: bucket.lastStatus,
 lastAt: new Date(bucket.lastAt).toISOString(),
 lifetimeRequests: bucket.lifetimeRequests,
 });
 }

 routes.sort((a, b) => Number(b.requests ?? 0) - Number(a.requests ?? 0));

 const mem = process.memoryUsage();
 return {
 generatedAt: new Date(now).toISOString(),
 startedAt: new Date(STARTED_AT).toISOString(),
 uptimeSec: Number(process.uptime().toFixed(2)),
 windowSec,
 global: {
 requests: globalRequests,
 throughputRps: Number((globalRequests / windowSec).toFixed(2)),
 avgLatencyMs: globalRequests === 0 ? 0 : Number((globalLatencySum / globalRequests).toFixed(2)),
 p95LatencyMs: Number(percentile95(p95Pool).toFixed(2)),
 errorRate: globalRequests === 0 ? 0 : Number(((globalErrors / globalRequests) * 100).toFixed(2)),
 errors: globalErrors,
 },
 routes,
 routeCount: routes.length,
 process: {
 rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
 heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
 heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
 },
 };
}

