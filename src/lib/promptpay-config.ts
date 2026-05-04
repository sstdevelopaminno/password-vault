import { normalizePromptPayTarget } from "@/lib/package-plans";

const PROMPTPAY_ENV_KEYS = [
  "PROMPTPAY_TARGET_PHONE",
  "PROMPTPAY_TARGET",
  "PAYMENT_PROMPTPAY_TARGET",
  "PACKAGE_PROMPTPAY_TARGET",
  "NEXT_PUBLIC_PROMPTPAY_TARGET_PHONE",
  "NEXT_PUBLIC_PROMPTPAY_TARGET",
  "PROMPTPAY_TARGET_URL",
  "PAYMENT_PROMPTPAY_TARGET_URL",
  "NEXT_PUBLIC_PROMPTPAY_TARGET_URL",
] as const;

const FALLBACK_PROMPTPAY_TARGET = "0843374982";

function extractPromptPayCandidate(raw: string) {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const fromUrl = text.match(/promptpay\.io\/([^/?#]+)/i)?.[1] ?? "";
  if (fromUrl) return normalizePromptPayTarget(fromUrl);
  return normalizePromptPayTarget(text);
}

export function resolvePromptPayTargetFromEnv() {
  for (const key of PROMPTPAY_ENV_KEYS) {
    const value = String(process.env[key] ?? "").trim();
    const normalized = extractPromptPayCandidate(value);
    if (normalized) return normalized;
  }
  return extractPromptPayCandidate(FALLBACK_PROMPTPAY_TARGET);
}

export function promptPayConfigErrorMessage() {
  return `Missing PromptPay target configuration (set one of: ${PROMPTPAY_ENV_KEYS.join(", ")})`;
}
