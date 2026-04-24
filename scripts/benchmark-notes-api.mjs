import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { performance } from "perf_hooks";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function waitForServer(baseUrl, timeoutMs = 120_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl + "/api/version", { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`Server returned status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Server not ready in ${timeoutMs}ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function quantile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return Number(sorted[index].toFixed(2));
}

function summarizeRuns(input) {
  const durations = input.map((item) => item.durationMs);
  const bytes = input.map((item) => item.bytes);
  const statuses = input.reduce((acc, item) => {
    const key = String(item.status);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    samples: input.length,
    statusCounts: statuses,
    latencyMs: {
      avg: Number((durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length)).toFixed(2)),
      p50: quantile(durations, 0.5),
      p95: quantile(durations, 0.95),
      min: quantile(durations, 0),
      max: quantile(durations, 1),
    },
    payloadBytes: {
      avg: Number((bytes.reduce((a, b) => a + b, 0) / Math.max(1, bytes.length)).toFixed(2)),
      p50: quantile(bytes, 0.5),
      p95: quantile(bytes, 0.95),
      min: quantile(bytes, 0),
      max: quantile(bytes, 1),
    },
  };
}

async function runEndpointBench(input) {
  const output = [];
  for (let i = 0; i < input.warmup + input.rounds; i += 1) {
    const started = performance.now();
    const response = await fetch(input.url, {
      method: "GET",
      headers: {
        Cookie: input.cookieHeader,
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
    });
    const text = await response.text();
    const elapsed = performance.now() - started;

    if (i < input.warmup) continue;
    output.push({
      status: response.status,
      durationMs: Number(elapsed.toFixed(2)),
      bytes: Buffer.byteLength(text),
    });
  }
  return summarizeRuns(output);
}

function extractCookieHeader(response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const rawCookies = getSetCookie ? getSetCookie() : [];
  let cookies = rawCookies;

  if (!cookies.length) {
    const single = response.headers.get("set-cookie");
    if (single) {
      cookies = single.split(/,(?=[^;]+?=)/g);
    }
  }

  const pairs = cookies
    .map((item) => String(item).split(";", 1)[0].trim())
    .filter(Boolean);

  return pairs.join("; ");
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const port = Number(process.env.BENCH_PORT || 3017);
  const baseUrl = `http://127.0.0.1:${port}`;
  const rounds = Number(process.env.BENCH_ROUNDS || 30);
  const warmup = Number(process.env.BENCH_WARMUP || 5);
  const shouldStartServer = String(process.env.BENCH_START_SERVER || "1") !== "0";

  let server = null;
  if (shouldStartServer) {
    const startCommand = process.platform === "win32"
      ? { cmd: "cmd.exe", args: ["/c", "npm run start -- -p " + String(port)] }
      : { cmd: "npm", args: ["run", "start", "--", "-p", String(port)] };

    server = spawn(startCommand.cmd, startCommand.args, {
      cwd: process.cwd(),
      stdio: "ignore",
      detached: true,
      env: process.env,
    });
    server.unref();
  }

  let tempUserId = "";
  try {
    await waitForServer(baseUrl);

    const admin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tempEmail = `bench_notes_${Date.now()}@example.local`;
    const tempPassword = "Bench#" + Math.random().toString(36).slice(2, 12) + "9A";
    const created = await admin.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: "Benchmark User" },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(created.error?.message || "Unable to create temporary benchmark user");
    }
    tempUserId = String(created.data.user.id);

    const nowIso = new Date().toISOString();
    const upserted = await admin
      .from("profiles")
      .upsert({
        id: tempUserId,
        email: tempEmail,
        full_name: "Benchmark User",
        role: "user",
        status: "active",
        email_verified_at: nowIso,
      });
    if (upserted.error) {
      throw new Error(upserted.error.message);
    }

    for (let i = 0; i < 12; i += 1) {
      const inserted = await admin.from("notes").insert({
        user_id: tempUserId,
        title: `Benchmark Note ${i + 1}`,
        content: "This is benchmark content block ".repeat(40),
        reminder_at: i % 2 === 0 ? new Date(Date.now() + (i + 1) * 60_000).toISOString() : null,
        meeting_at: i % 3 === 0 ? new Date(Date.now() + (i + 1) * 90_000).toISOString() : null,
        updated_at: new Date(Date.now() - i * 2_000).toISOString(),
      });
      if (inserted.error) {
        throw new Error(inserted.error.message);
      }
    }

    const loginRes = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: tempEmail, password: tempPassword }),
    });

    if (!loginRes.ok) {
      const body = await loginRes.text();
      throw new Error(`Login failed (${loginRes.status}): ${body.slice(0, 240)}`);
    }

    const cookieHeader = extractCookieHeader(loginRes);
    if (!cookieHeader) {
      throw new Error("Login succeeded but no auth cookie was returned");
    }

    const fullResult = await runEndpointBench({
      url: `${baseUrl}/api/notes?limit=180&page=1`,
      cookieHeader,
      rounds,
      warmup,
    });

    const calendarResult = await runEndpointBench({
      url: `${baseUrl}/api/notes?limit=180&page=1&view=calendar`,
      cookieHeader,
      rounds,
      warmup,
    });

    const avgFullBytes = Number(fullResult.payloadBytes.avg || 0);
    const avgCalendarBytes = Number(calendarResult.payloadBytes.avg || 0);
    const avgFullP95 = Number(fullResult.latencyMs.p95 || 0);
    const avgCalendarP95 = Number(calendarResult.latencyMs.p95 || 0);

    const summary = {
      meta: {
        port,
        rounds,
        warmup,
        timestamp: new Date().toISOString(),
      },
      endpoints: {
        full: fullResult,
        calendar: calendarResult,
      },
      improvement: {
        payloadAvgBytesReduction: Number((avgFullBytes - avgCalendarBytes).toFixed(2)),
        payloadReductionPercent: avgFullBytes > 0
          ? Number((((avgFullBytes - avgCalendarBytes) / avgFullBytes) * 100).toFixed(2))
          : 0,
        p95LatencyReductionMs: Number((avgFullP95 - avgCalendarP95).toFixed(2)),
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    try {
      if (tempUserId) {
        const admin = createClient(supabaseUrl, supabaseServiceRole, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await admin.from("notes").delete().eq("user_id", tempUserId);
        await admin.from("approval_requests").delete().eq("user_id", tempUserId);
        await admin.from("profiles").delete().eq("id", tempUserId);
        await admin.auth.admin.deleteUser(tempUserId);
      }
    } catch {
      // ignore cleanup errors
    }

    if (server && !server.killed) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"]);
        } catch {
          // ignore Windows taskkill errors
        }
      } else {
        server.kill("SIGTERM");
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
