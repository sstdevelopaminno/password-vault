import { normalizePromptPayTarget } from "@/lib/package-plans";

const PROMPTPAY_ENV_KEYS = [
  "PROMPTPAY_TARGET_PHONE",
  "PROMPTPAY_TARGET",
  "PAYMENT_PROMPTPAY_TARGET",
  "PACKAGE_PROMPTPAY_TARGET",
  "NEXT_PUBLIC_PROMPTPAY_TARGET_PHONE",
  "NEXT_PUBLIC_PROMPTPAY_TARGET",
] as const;

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
  return "";
}

export function promptPayConfigErrorMessage() {
  return `Missing PromptPay target configuration (set one of: ${PROMPTPAY_ENV_KEYS.join(", ")})`;
}

