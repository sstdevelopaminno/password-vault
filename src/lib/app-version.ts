import packageJson from "../../package.json";

function normalizeAppVersion(input: string) {
  const cleaned = input.trim().replace(/^v/i, "");
  if (!cleaned) return "";
  return `V${cleaned}`;
}

const overrideVersion = normalizeAppVersion(String(process.env.APP_VERSION_OVERRIDE ?? "").trim());
const packageVersion = normalizeAppVersion(String(packageJson.version ?? "").trim());
const legacyPublicVersion = normalizeAppVersion(String(process.env.NEXT_PUBLIC_APP_VERSION ?? "").trim());

// Source of truth: package.json (with optional explicit APP_VERSION_OVERRIDE).
export const APP_VERSION = overrideVersion || packageVersion || legacyPublicVersion || "V0.0.0";

export function versionLabel(locale: string) {
  return locale === "th" ? `เวอร์ชัน ${APP_VERSION}` : `Version ${APP_VERSION}`;
}
