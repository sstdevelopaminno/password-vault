import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const options = {
    envFile: ".env.local",
    baseUrl: "http://localhost:3001",
    strictOtpRequest: false,
    keepUser: false,
    emailDomain: "test.com",
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--strict-otp-request") {
      options.strictOtpRequest = true;
      continue;
    }
    if (arg === "--keep-user") {
      options.keepUser = true;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length).trim();
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length).trim();
      continue;
    }
    if (arg.startsWith("--email-domain=")) {
      options.emailDomain = arg.slice("--email-domain=".length).trim().toLowerCase();
      continue;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/smoke-face-auth.mjs [options]

Options:
  --base-url=http://localhost:3001
  --env-file=.env.local
  --email-domain=test.com
  --strict-otp-request      Fail when /recovery/request-otp is not 2xx
  --keep-user               Do not delete smoke user after test

Example:
  node scripts/smoke-face-auth.mjs --base-url=http://localhost:3001
`);
}

function parseDotEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function normalizeVector(values) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Unable to normalize face vector");
  }
  return values.map((value) => Number((value / magnitude).toFixed(6)));
}

function deriveKey(raw) {
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptText(raw, keyRaw) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(keyRaw), iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERT_FAIL: ${message}`);
  }
}

function createCookieJar() {
  const map = new Map();
  return {
    applySetCookies(response) {
      const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      for (const entry of setCookies) {
        const first = String(entry).split(";")[0] ?? "";
        const idx = first.indexOf("=");
        if (idx <= 0) continue;
        const name = first.slice(0, idx);
        const value = first.slice(idx + 1);
        if (!value) {
          map.delete(name);
        } else {
          map.set(name, value);
        }
      }
    },
    header() {
      if (!map.size) return "";
      return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envPath = path.resolve(process.cwd(), options.envFile);
  const fileEnv = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, "utf8")) : {};
  const env = { ...fileEnv, ...process.env };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  const appKey = env.APP_ENCRYPTION_KEY;
  if (!supabaseUrl || !serviceRole || !appKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / APP_ENCRYPTION_KEY");
  }

  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `faceflow.${Date.now()}@${options.emailDomain}`;
  const password = "FaceFlow!Pass2026";
  const pin = "112233";
  let userId = "";

  const cookieJar = createCookieJar();
  async function requestJson(url, init = {}) {
    const headers = new Headers(init.headers || {});
    const cookie = cookieJar.header();
    if (cookie) headers.set("cookie", cookie);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

    const response = await fetch(url, { ...init, headers });
    cookieJar.applySetCookies(response);
    const json = await response.json().catch(() => ({}));
    return { response, json };
  }

  const summary = {
    ok: false,
    baseUrl,
    email,
    userId: "",
    recoveryRequestStatus: null,
    recoveryRequestBody: null,
    sessionBeforeVerify: null,
    sessionAfterFaceVerify: null,
    sessionAfterOtpRecovery: null,
  };

  try {
    const health = await fetch(`${baseUrl}/login`, { method: "GET" }).catch(() => null);
    assert(health && health.ok, `Local app is not reachable at ${baseUrl}`);

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Face Flow Smoke" },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`Failed to create smoke user: ${created.error?.message ?? "unknown"}`);
    }
    userId = created.data.user.id;
    summary.userId = userId;

    const nowIso = new Date().toISOString();
    const pinHash = await bcrypt.hash(pin, 12);
    const profileUpsert = await admin.from("profiles").upsert({
      id: userId,
      email,
      full_name: "Face Flow Smoke",
      role: "user",
      status: "active",
      pin_hash: pinHash,
      email_verified_at: nowIso,
      face_auth_enabled: true,
      face_enrolled_at: nowIso,
    });
    if (profileUpsert.error) {
      throw new Error(`Failed to upsert profile: ${profileUpsert.error.message}`);
    }

    const baseVector = normalizeVector(Array.from({ length: 256 }, (_, index) => Math.sin(index * 0.11)));
    const secondVector = normalizeVector(
      baseVector.map((value, index) => value + (index % 7 === 0 ? 0.0008 : -0.0004)),
    );
    const template = {
      version: "v1",
      vectors: [baseVector, secondVector],
      enrolledAt: nowIso,
      qualityScore: 0.95,
    };
    const biometricUpsert = await admin.from("user_face_biometrics").upsert({
      user_id: userId,
      template_encrypted: encryptText(JSON.stringify(template), appKey),
      template_version: "v1",
      enrollment_source: "smoke_script",
      enrolled_at: nowIso,
      updated_at: nowIso,
      failed_attempts: 0,
      locked_until: null,
    });
    if (biometricUpsert.error) {
      throw new Error(`Failed to upsert biometric: ${biometricUpsert.error.message}`);
    }

    const login = await requestJson(`${baseUrl}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert(login.response.ok, `login failed: ${JSON.stringify(login.json)}`);

    const session1 = await requestJson(`${baseUrl}/api/face-auth/session`, { method: "GET" });
    assert(session1.response.ok, `session-before failed: ${JSON.stringify(session1.json)}`);
    assert(session1.json.required === true, "session should require face-pin");
    assert(session1.json.verified === false, "session should be unverified before face verify");
    summary.sessionBeforeVerify = { required: session1.json.required, verified: session1.json.verified };

    const faceVerify = await requestJson(`${baseUrl}/api/face-auth/verify`, {
      method: "POST",
      body: JSON.stringify({
        pin,
        sample: { vector: baseVector, quality: 0.9, motionScore: 0.2 },
      }),
    });
    assert(faceVerify.response.ok, `face verify failed: ${JSON.stringify(faceVerify.json)}`);

    const session2 = await requestJson(`${baseUrl}/api/face-auth/session`, { method: "GET" });
    assert(session2.response.ok, `session-after-face failed: ${JSON.stringify(session2.json)}`);
    assert(session2.json.verified === true, "session should be verified after face verify");
    summary.sessionAfterFaceVerify = { required: session2.json.required, verified: session2.json.verified };

    const relogin = await requestJson(`${baseUrl}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert(relogin.response.ok, `relogin failed: ${JSON.stringify(relogin.json)}`);

    const recoveryRequest = await requestJson(`${baseUrl}/api/face-auth/recovery/request-otp`, {
      method: "POST",
    });
    summary.recoveryRequestStatus = recoveryRequest.response.status;
    summary.recoveryRequestBody = recoveryRequest.json;
    if (options.strictOtpRequest) {
      assert(recoveryRequest.response.ok, `recovery request failed: ${JSON.stringify(recoveryRequest.json)}`);
    }

    const generated = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (generated.error) {
      throw new Error(`Failed to generate recovery OTP: ${generated.error.message}`);
    }
    const recoveryOtp = String(generated.data?.properties?.email_otp ?? "");
    assert(/^\d{6}$/.test(recoveryOtp), "recovery OTP not generated");

    const recoveryVerify = await requestJson(`${baseUrl}/api/face-auth/recovery/verify-otp`, {
      method: "POST",
      body: JSON.stringify({ otp: recoveryOtp }),
    });
    assert(recoveryVerify.response.ok, `recovery verify failed: ${JSON.stringify(recoveryVerify.json)}`);

    const session3 = await requestJson(`${baseUrl}/api/face-auth/session`, { method: "GET" });
    assert(session3.response.ok, `session-after-otp failed: ${JSON.stringify(session3.json)}`);
    assert(session3.json.verified === true, "session should be verified after OTP recovery");
    summary.sessionAfterOtpRecovery = { required: session3.json.required, verified: session3.json.verified };

    summary.ok = true;
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (userId && !options.keepUser) {
      await admin.from("audit_logs").delete().eq("actor_user_id", userId);
      await admin.from("audit_logs").delete().eq("target_user_id", userId);
      await admin.from("user_face_biometrics").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      const cleanup = await admin.auth.admin.deleteUser(userId);
      if (cleanup.error) {
        console.error(`WARN: cleanup failed for ${userId}: ${cleanup.error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
