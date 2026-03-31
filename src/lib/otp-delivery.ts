import { createAdminClient } from "@/lib/supabase/admin";

type OtpPurpose = "signup" | "recovery";
type OtpProvider = "resend" | "engagelab";

type SendOtpProviderInput = {
  email: string;
  otp: string;
  purpose: OtpPurpose;
};

type DeliveryResult = {
  ok: boolean;
  retryAfterSec: number;
  channel: "supabase" | "fallback-provider";
  error?: string;
};

type FallbackSignupInput = {
  email: string;
  password: string;
  fullName: string;
};

function isAlreadyRegisteredError(message: string) {
  const lower = String(message ?? "").toLowerCase();
  return (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  );
}

export function parseRetryAfterSeconds(message: string) {
  const text = String(message ?? "");
  const patterns = [
    /after\s+(\d+)\s*seconds?/i,
    /try again in\s+(\d+)\s*seconds?/i,
    /wait\s+(\d+)\s*seconds?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }

  return 0;
}

export function isOtpSendConstraintError(message: string) {
  const lower = String(message ?? "").toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("for security purposes") ||
    lower.includes("request this after") ||
    lower.includes("over_email_send_rate_limit") ||
    lower.includes("email address not authorized") ||
    lower.includes("smtp") ||
    lower.includes("exceeded frequency limit") ||
    lower.includes("cannot resend to the same template and target user") ||
    lower.includes("engagelab 3004")
  );
}

export function isOtpProviderConfigError(message: string) {
  const lower = String(message ?? "").toLowerCase();
  return (
    lower.includes("api key is invalid") ||
    lower.includes("otp_email_provider_key is missing") ||
    lower.includes("from field is invalid") ||
    lower.includes("domain is not verified") ||
    lower.includes("authentication failed") ||
    lower.includes("otp_engagelab_dev_key is missing") ||
    lower.includes("otp_engagelab_dev_secret is missing") ||
    lower.includes("otp_engagelab_template_id is missing") ||
    lower.includes("otp_resend_api_key is missing") ||
    lower.includes("engagelab 2001") ||
    lower.includes("engagelab 2002") ||
    lower.includes("engagelab 2004") ||
    lower.includes("engagelab 3001") ||
    lower.includes("engagelab 3002") ||
    lower.includes("engagelab 3003") ||
    lower.includes("engagelab 4001")
  );
}

function unwrapQuoted(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return "";
  return unwrapQuoted(raw);
}

function getOtpProvider(): OtpProvider {
  const explicit = getEnv("OTP_PROVIDER").toLowerCase();
  if (explicit === "engagelab") return "engagelab";
  if (explicit === "resend") return "resend";
  if (getEnv("OTP_ENGAGELAB_DEV_KEY") || getEnv("OTP_ENGAGELAB_TEMPLATE_ID")) return "engagelab";
  return "resend";
}

function getResendApiKey(options?: { allowLegacy?: boolean }) {
  const dedicated = getEnv("OTP_RESEND_API_KEY");
  if (dedicated) return dedicated;

  if (options?.allowLegacy) {
    return getEnv("OTP_EMAIL_PROVIDER_KEY");
  }

  return "";
}

function getEngageLabDevKey() {
  return getEnv("OTP_ENGAGELAB_DEV_KEY");
}

function getEngageLabDevSecret() {
  const dedicated = getEnv("OTP_ENGAGELAB_DEV_SECRET");
  if (dedicated) return dedicated;
  return getEnv("OTP_EMAIL_PROVIDER_KEY");
}

function getEngageLabTemplateId() {
  return getEnv("OTP_ENGAGELAB_TEMPLATE_ID");
}

function getEngageLabTemplateLang() {
  const lang = getEnv("OTP_ENGAGELAB_TEMPLATE_LANG");
  return lang || "default";
}

function getOtpMailFrom() {
  const fallback = "no-reply@password-vault.local";
  const value = getEnv("OTP_EMAIL_FROM");
  return value || fallback;
}

function getAppName() {
  const fallback = "Password Vault";
  const value = getEnv("OTP_APP_NAME");
  return value || fallback;
}

function buildOtpMail(input: SendOtpProviderInput) {
  const appName = getAppName();
  const action =
    input.purpose === "signup"
      ? { th: "ยืนยันการสมัครสมาชิก", en: "confirm your sign up" }
      : { th: "ยืนยันการรีเซ็ตรหัสผ่าน", en: "confirm password reset" };

  const subject =
    input.purpose === "signup"
      ? `${appName}: OTP สำหรับสมัครสมาชิก`
      : `${appName}: OTP สำหรับรีเซ็ตรหัสผ่าน`;

  const text = [
    `${appName}`,
    "",
    `OTP: ${input.otp}`,
    "",
    `ใช้รหัสนี้เพื่อ${action.th} / Use this code to ${action.en}.`,
    "รหัสมีอายุ 5 นาที / Code expires in 5 minutes.",
  ].join("\n");

  const html = [
    "<div style=\"font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a\">",
    `<h2 style=\"margin:0 0 12px\">${appName}</h2>`,
    `<p style=\"margin:0 0 12px\">ใช้รหัส OTP เพื่อ${action.th}<br/>Use this OTP code to ${action.en}.</p>`,
    `<div style=\"font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 16px;background:#e2e8f0;border-radius:10px;display:inline-block\">${input.otp}</div>`,
    "<p style=\"margin:12px 0 0;color:#475569\">รหัสมีอายุ 5 นาที / Code expires in 5 minutes.</p>",
    "</div>",
  ].join("");

  return { subject, text, html };
}

async function sendOtpWithResend(input: SendOtpProviderInput, options?: { allowLegacyApiKey?: boolean }) {
  const apiKey = getResendApiKey({ allowLegacy: options?.allowLegacyApiKey ?? true });
  if (!apiKey) {
    return { ok: false, error: "OTP_RESEND_API_KEY is missing" };
  }

  const mail = buildOtpMail(input);
  const from = getOtpMailFrom();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });

  if (!res.ok) {
    const message = (await res.text().catch(() => "")) || `Resend API error: ${res.status}`;
    return { ok: false, error: message };
  }

  return { ok: true };
}

async function sendOtpWithEngageLab(input: SendOtpProviderInput) {
  const devKey = getEngageLabDevKey();
  const devSecret = getEngageLabDevSecret();
  const templateId = getEngageLabTemplateId();
  const templateLang = getEngageLabTemplateLang();

  if (!devKey) return { ok: false, error: "OTP_ENGAGELAB_DEV_KEY is missing" };
  if (!devSecret) return { ok: false, error: "OTP_ENGAGELAB_DEV_SECRET is missing" };
  if (!templateId) return { ok: false, error: "OTP_ENGAGELAB_TEMPLATE_ID is missing" };

  const auth = Buffer.from(`${devKey}:${devSecret}`).toString("base64");
  const appName = getAppName();

  const res = await fetch("https://otp.api.engagelab.cc/v1/codes", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.email,
      code: input.otp,
      template: {
        id: templateId,
        language: templateLang,
        params: {
          app_name: appName,
          brand_name: appName,
          code: input.otp,
          otp: input.otp,
          otp_code: input.otp,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({} as { code?: number; message?: string }))) as {
      code?: number;
      message?: string;
    };
    const codeText = typeof body.code === "number" ? String(body.code) : "";
    const message = String(body.message ?? "");
    const merged = codeText ? `EngageLab ${codeText}: ${message || `HTTP ${res.status}`}` : message || `EngageLab HTTP ${res.status}`;
    return { ok: false, error: merged };
  }

  return { ok: true };
}

async function sendOtpWithProvider(input: SendOtpProviderInput) {
  const provider = getOtpProvider();

  if (provider === "engagelab") {
    const primary = await sendOtpWithEngageLab(input);
    if (primary.ok) return primary;

    const secondary = await sendOtpWithResend(input, { allowLegacyApiKey: false });
    if (secondary.ok) return secondary;

    return {
      ok: false,
      error: `Primary EngageLab failed: ${String(primary.error ?? "unknown")}. Secondary Resend failed: ${String(secondary.error ?? "unknown")}`,
    };
  }

  return sendOtpWithResend(input, { allowLegacyApiKey: true });
}

function extractEmailOtp(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const maybeAny = data as {
    properties?: { email_otp?: string };
  };
  const otp = maybeAny.properties?.email_otp ?? "";
  return typeof otp === "string" ? otp : "";
}

async function generateSignupOtp(admin: ReturnType<typeof createAdminClient>, input: FallbackSignupInput) {
  const generatedSignup = await admin.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
    },
  });

  if (!generatedSignup.error) {
    const otp = extractEmailOtp(generatedSignup.data);
    if (otp) {
      return { otp, error: "" };
    }
  }

  if (!isAlreadyRegisteredError(generatedSignup.error?.message ?? "")) {
    return { otp: "", error: generatedSignup.error?.message ?? "Failed to generate signup OTP" };
  }

  const generatedMagicLink = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
  });
  if (generatedMagicLink.error) {
    return { otp: "", error: generatedMagicLink.error.message };
  }

  const otp = extractEmailOtp(generatedMagicLink.data);
  if (!otp) {
    return { otp: "", error: "Fallback provider could not generate signup OTP." };
  }

  return { otp, error: "" };
}

export async function sendSignupOtpViaFallback(input: FallbackSignupInput): Promise<DeliveryResult> {
  const admin = createAdminClient();
  const generated = await generateSignupOtp(admin, input);
  if (!generated.otp) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: parseRetryAfterSeconds(generated.error) || 60,
      error: generated.error,
    };
  }

  const sent = await sendOtpWithProvider({ email: input.email, otp: generated.otp, purpose: "signup" });
  if (!sent.ok) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: 60,
      error: sent.error,
    };
  }

  return {
    ok: true,
    channel: "fallback-provider",
    retryAfterSec: 60,
  };
}

export async function sendRecoveryOtpViaFallback(email: string): Promise<DeliveryResult> {
  const admin = createAdminClient();
  const generated = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (generated.error) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: parseRetryAfterSeconds(generated.error.message) || 60,
      error: generated.error.message,
    };
  }

  const otp = extractEmailOtp(generated.data);
  if (!otp) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: 60,
      error: "Fallback provider could not generate recovery OTP.",
    };
  }

  const sent = await sendOtpWithProvider({ email, otp, purpose: "recovery" });
  if (!sent.ok) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: 60,
      error: sent.error,
    };
  }

  return {
    ok: true,
    channel: "fallback-provider",
    retryAfterSec: 60,
  };
}

export async function sendSignupResendOtpViaFallback(email: string): Promise<DeliveryResult> {
  const admin = createAdminClient();
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (generated.error) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: parseRetryAfterSeconds(generated.error.message) || 60,
      error: generated.error.message,
    };
  }

  const otp = extractEmailOtp(generated.data);
  if (!otp) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: 60,
      error: "Fallback provider could not generate resend OTP.",
    };
  }

  const sent = await sendOtpWithProvider({ email, otp, purpose: "signup" });
  if (!sent.ok) {
    return {
      ok: false,
      channel: "fallback-provider",
      retryAfterSec: 60,
      error: sent.error,
    };
  }

  return {
    ok: true,
    channel: "fallback-provider",
    retryAfterSec: 60,
  };
}
