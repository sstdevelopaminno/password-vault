import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();

function parseArgs(argv) {
  const options = {
    envFile: ".env.local",
    probeEmail: "",
    probeSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length).trim();
      continue;
    }
    if (arg.startsWith("--probe-email=")) {
      options.probeEmail = arg.slice("--probe-email=".length).trim();
      continue;
    }
    if (arg === "--probe-supabase") {
      options.probeSupabase = true;
      continue;
    }
  }
  return options;
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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function isPlaceholder(value) {
  const text = String(value ?? "").toLowerCase();
  return (
    text.includes("changeme") ||
    text.includes("replace_me") ||
    text.includes("your_") ||
    text.includes("example") ||
    text === "xxxx" ||
    text === "todo"
  );
}

function redact(value) {
  const text = String(value ?? "");
  if (!text) return "(empty)";
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

async function probeEngageLab(env, probeEmail) {
  const auth = Buffer.from(`${env.OTP_ENGAGELAB_DEV_KEY}:${env.OTP_ENGAGELAB_DEV_SECRET}`).toString("base64");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const body = {
    to: probeEmail,
    code,
    template: {
      id: env.OTP_ENGAGELAB_TEMPLATE_ID,
      language: env.OTP_ENGAGELAB_TEMPLATE_LANG || "default",
      params: {
        app_name: env.OTP_APP_NAME || "Password Vault",
        brand_name: env.OTP_APP_NAME || "Password Vault",
        code,
        otp: code,
        otp_code: code,
      },
    },
  };

  const response = await fetch("https://otp.api.engagelab.cc/v1/codes", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return { ok: true, message: "Probe sent via EngageLab." };
  }
  const errorBody = await response.text().catch(() => "");
  return {
    ok: false,
    message: `EngageLab probe failed (${response.status}): ${errorBody || "no response body"}`,
  };
}

async function probeResend(env, probeEmail) {
  const apiKey = env.OTP_RESEND_API_KEY || env.OTP_EMAIL_PROVIDER_KEY;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.OTP_EMAIL_FROM,
      to: [probeEmail],
      subject: `${env.OTP_APP_NAME || "Password Vault"} OTP Provider Probe`,
      text: "OTP provider probe from Password Vault",
      html: "<p>OTP provider probe from Password Vault</p>",
    }),
  });

  if (response.ok) {
    return { ok: true, message: "Probe sent via Resend." };
  }
  const errorBody = await response.text().catch(() => "");
  return {
    ok: false,
    message: `Resend probe failed (${response.status}): ${errorBody || "no response body"}`,
  };
}

async function probeSupabaseOtp(env, probeEmail) {
  const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      message: "Supabase probe failed: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.",
    };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.signInWithOtp({
    email: probeEmail,
    options: {
      shouldCreateUser: false,
    },
  });

  if (!error) {
    return { ok: true, message: "Supabase OTP probe accepted." };
  }

  const text = String(error.message ?? "");
  const lower = text.toLowerCase();
  if (lower.includes("rate") || lower.includes("too many") || lower.includes("security purposes")) {
    return {
      ok: false,
      message: `Supabase OTP probe was rate-limited: ${text}`,
    };
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return {
      ok: false,
      message: `Supabase OTP probe failed (invalid email): ${text}`,
    };
  }

  return {
    ok: false,
    message: `Supabase OTP probe failed: ${text || "unknown error"}`,
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-otp-env.mjs [--env-file=.env.local] [--probe-email=you@domain.com] [--probe-supabase]

Examples:
  node scripts/check-otp-env.mjs
  node scripts/check-otp-env.mjs --env-file=.env.production.local
  node scripts/check-otp-env.mjs --probe-email=ops@your-domain.com
  node scripts/check-otp-env.mjs --probe-email=ops@your-domain.com --probe-supabase
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envPath = path.resolve(PROJECT_ROOT, options.envFile);
  const fileEnv = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, "utf8")) : {};
  const env = { ...fileEnv, ...process.env };

  const errors = [];
  const warnings = [];
  const infos = [];

  const provider = String(env.OTP_PROVIDER || "").toLowerCase();
  if (!["engagelab", "resend"].includes(provider)) {
    errors.push("OTP_PROVIDER must be 'engagelab' or 'resend'.");
  }

  if (!String(env.NEXT_PUBLIC_SUPABASE_URL || "").startsWith("https://")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid https URL.");
  }
  if (!String(env.SUPABASE_SERVICE_ROLE_KEY || "")) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }
  if (String(env.APP_ENCRYPTION_KEY || "").length < 32) {
    errors.push("APP_ENCRYPTION_KEY must be at least 32 characters.");
  }

  if (!isEmail(env.OTP_EMAIL_FROM)) {
    errors.push("OTP_EMAIL_FROM must be a valid sender email.");
  }
  if (!String(env.OTP_APP_NAME || "").trim()) {
    warnings.push("OTP_APP_NAME is empty. Consider setting an app display name.");
  }

  if (provider === "engagelab") {
    if (!String(env.OTP_ENGAGELAB_DEV_KEY || "").trim()) {
      errors.push("OTP_ENGAGELAB_DEV_KEY is missing.");
    }
    if (!String(env.OTP_ENGAGELAB_DEV_SECRET || "").trim()) {
      errors.push("OTP_ENGAGELAB_DEV_SECRET is missing.");
    }
    if (!String(env.OTP_ENGAGELAB_TEMPLATE_ID || "").trim()) {
      errors.push("OTP_ENGAGELAB_TEMPLATE_ID is missing.");
    }
    if (!String(env.OTP_RESEND_API_KEY || "").trim()) {
      warnings.push("OTP_RESEND_API_KEY is not set. Secondary fallback via Resend will be unavailable.");
    }
  }

  if (provider === "resend") {
    const resendKey = String(env.OTP_RESEND_API_KEY || env.OTP_EMAIL_PROVIDER_KEY || "").trim();
    if (!resendKey) {
      errors.push("OTP_RESEND_API_KEY (or legacy OTP_EMAIL_PROVIDER_KEY) is required for OTP_PROVIDER=resend.");
    }
  }

  const toCheck = [
    "OTP_PROVIDER",
    "OTP_EMAIL_FROM",
    "OTP_APP_NAME",
    "OTP_ENGAGELAB_DEV_KEY",
    "OTP_ENGAGELAB_DEV_SECRET",
    "OTP_ENGAGELAB_TEMPLATE_ID",
    "OTP_RESEND_API_KEY",
  ];
  for (const key of toCheck) {
    const value = env[key];
    if (value && isPlaceholder(value)) {
      warnings.push(`${key} looks like a placeholder value.`);
    }
  }

  infos.push(`Env file: ${fs.existsSync(envPath) ? envPath : `${envPath} (not found, using process.env only)`}`);
  infos.push(`OTP_PROVIDER=${String(provider || "(empty)")}`);
  infos.push(`OTP_EMAIL_FROM=${String(env.OTP_EMAIL_FROM || "(empty)")}`);
  infos.push(`OTP_ENGAGELAB_DEV_KEY=${redact(env.OTP_ENGAGELAB_DEV_KEY)}`);
  infos.push(`OTP_RESEND_API_KEY=${redact(env.OTP_RESEND_API_KEY)}`);

  console.log("OTP Environment Check");
  console.log("=====================");
  for (const info of infos) {
    console.log(`- ${info}`);
  }

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const item of warnings) console.log(`- ${item}`);
  }

  if (errors.length) {
    console.log("\nErrors:");
    for (const item of errors) console.log(`- ${item}`);
    process.exitCode = 1;
    return;
  }

  if (options.probeEmail) {
    if (!isEmail(options.probeEmail)) {
      console.log(`\nErrors:\n- --probe-email is invalid: ${options.probeEmail}`);
      process.exitCode = 1;
      return;
    }

    console.log(`\nRunning provider probe to ${options.probeEmail}...`);
    const probeResult =
      provider === "engagelab"
        ? await probeEngageLab(env, options.probeEmail)
        : await probeResend(env, options.probeEmail);

    console.log(probeResult.message);
    if (!probeResult.ok) {
      process.exitCode = 1;
    }

    if (options.probeSupabase) {
      console.log(`Running Supabase OTP probe to ${options.probeEmail}...`);
      const supabaseProbe = await probeSupabaseOtp(env, options.probeEmail);
      console.log(supabaseProbe.message);
      if (!supabaseProbe.ok) {
        process.exitCode = 1;
      }
    }
  } else if (options.probeSupabase) {
    console.log("\nErrors:\n- --probe-supabase requires --probe-email=<registered-user-email>");
    process.exitCode = 1;
    return;
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.log("\nResult: FAIL");
    return;
  }
  console.log("\nResult: PASS");
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
