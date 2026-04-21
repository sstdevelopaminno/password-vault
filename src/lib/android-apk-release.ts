import packageJson from "../../package.json";
import { DEFAULT_ANDROID_PACKAGE } from "@/lib/release-update";

export const ANDROID_APK_PROMPT_SEEN_KEY = "pv_android_apk_prompt_seen_version";
export const ANDROID_APK_PROMPT_SNOOZE_KEY = "pv_android_apk_prompt_snooze_until";

export type AndroidApkRelease = {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  packageName: string;
  signingKeySha256: string;
  publishedAt: string;
};

export type AndroidApkCompatibility = {
  trustedPackageName: string;
  trustedSigningKeySha256: string;
  samePackageName: boolean;
  sameSigningKey: boolean;
  canInstallOverExisting: boolean;
};

type AndroidApkReleasePayload = {
  ok: true;
  release: AndroidApkRelease;
  compatibility: AndroidApkCompatibility;
};

function normalizeReleaseVersion(input: string) {
  const cleaned = input.trim().replace(/^v/i, "");
  if (!cleaned) return "0.0.0";
  return cleaned;
}

function parsePositiveInt(input: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function deriveVersionCodeFromName(versionName: string) {
  const matched = normalizeReleaseVersion(versionName).match(/^(\d+)\.(\d+)\.(\d+)(?:[.-].*)?$/);
  if (!matched) return 0;
  const major = Number.parseInt(matched[1], 10) || 0;
  const minor = Number.parseInt(matched[2], 10) || 0;
  const patch = Number.parseInt(matched[3], 10) || 0;
  return Math.max(major * 1000 + minor * 100 + patch, 1);
}

function resolvePackageRelease() {
  const packageVersion = normalizeReleaseVersion(String(packageJson.version ?? "").trim());
  return {
    versionName: packageVersion === "0.0.0" ? "" : packageVersion,
    versionCode: deriveVersionCodeFromName(packageVersion),
  };
}

const packageRelease = resolvePackageRelease();
const overrideVersionName = normalizeReleaseVersion(String(process.env.ANDROID_APK_VERSION_OVERRIDE ?? "").trim());
const legacyVersionName = normalizeReleaseVersion(String(process.env.NEXT_PUBLIC_ANDROID_APK_VERSION ?? "").trim());
const resolvedVersionName =
  (overrideVersionName !== "0.0.0" ? overrideVersionName : "") ||
  packageRelease.versionName ||
  (legacyVersionName !== "0.0.0" ? legacyVersionName : "") ||
  "0.0.0";

const overrideVersionCode = parsePositiveInt(String(process.env.ANDROID_APK_VERSION_CODE_OVERRIDE ?? "").trim());
const legacyVersionCode = parsePositiveInt(String(process.env.NEXT_PUBLIC_ANDROID_APK_VERSION_CODE ?? "").trim());
const resolvedVersionCode =
  overrideVersionCode || packageRelease.versionCode || legacyVersionCode || deriveVersionCodeFromName(resolvedVersionName) || 1;

const expectedApkFileName = `vault-v${resolvedVersionName}.apk`;
const releaseBaseUrl = String(process.env.ANDROID_APK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.CAPACITOR_SERVER_URL ?? "")
  .trim()
  .replace(/\/+$/g, "");
const defaultReleaseBaseUrl = releaseBaseUrl || "https://password-vault-ivory.vercel.app";
const overrideDownloadUrl = String(process.env.ANDROID_APK_URL_OVERRIDE ?? "").trim();
const legacyDownloadUrl = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? "").trim();
const legacyDownloadUrlMatchesRelease = legacyDownloadUrl.includes(expectedApkFileName);
const legacyVersionMatchesRelease = legacyVersionName === resolvedVersionName;
const resolvedDownloadUrl =
  overrideDownloadUrl ||
  (legacyDownloadUrlMatchesRelease ? legacyDownloadUrl : "") ||
  `${defaultReleaseBaseUrl}/apk/${expectedApkFileName}`;

const rawPackageName = String(process.env.NEXT_PUBLIC_ANDROID_APK_PACKAGE_NAME ?? "").trim();
const rawSigningKeySha256 = String(process.env.NEXT_PUBLIC_ANDROID_APK_SIGNING_SHA256 ?? "").trim();
const overridePublishedAt = String(process.env.ANDROID_APK_PUBLISHED_AT_OVERRIDE ?? "").trim();
const legacyPublishedAt = String(process.env.NEXT_PUBLIC_ANDROID_APK_PUBLISHED_AT ?? "").trim();
const defaultPublishedAt = new Date().toISOString().slice(0, 10);

export const DEFAULT_ANDROID_APK_RELEASE: AndroidApkRelease = {
  versionName: resolvedVersionName,
  versionCode: resolvedVersionCode,
  downloadUrl: resolvedDownloadUrl,
  packageName: rawPackageName || DEFAULT_ANDROID_PACKAGE,
  signingKeySha256:
    rawSigningKeySha256 ||
    "58:E9:92:5D:0F:6A:A3:DA:28:C8:57:EA:53:3B:4A:CB:5E:CB:CB:9B:8F:46:E3:A3:74:67:B9:E2:B0:DC:F7:4C",
  publishedAt: overridePublishedAt || (legacyVersionMatchesRelease ? legacyPublishedAt : "") || defaultPublishedAt,
};

function toComparableVersionParts(input: string) {
  const cleaned = normalizeReleaseVersion(input)
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part >= 0);

  if (!cleaned.length) return [0, 0, 0, 0];
  while (cleaned.length < 4) cleaned.push(0);
  return cleaned.slice(0, 4);
}

export function compareReleaseVersion(left: string, right: string) {
  const a = toComparableVersionParts(left);
  const b = toComparableVersionParts(right);

  for (let index = 0; index < 4; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

export function compareReleaseByCodeOrVersion(input: {
  installedVersionName?: string;
  installedVersionCode?: number | null;
  releaseVersionName: string;
  releaseVersionCode?: number | null;
}) {
  const installedCode = Number(input.installedVersionCode);
  const releaseCode = Number(input.releaseVersionCode);
  const hasInstalledCode = Number.isFinite(installedCode) && installedCode > 0;
  const hasReleaseCode = Number.isFinite(releaseCode) && releaseCode > 0;

  if (hasInstalledCode && hasReleaseCode) {
    if (installedCode > releaseCode) return 1;
    if (installedCode < releaseCode) return -1;
    return 0;
  }

  return compareReleaseVersion(String(input.installedVersionName ?? ""), input.releaseVersionName);
}

export function normalizeSigningFingerprint(input: string) {
  const normalized = input
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");

  if (normalized.length !== 64) return "";

  const parts: string[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    parts.push(normalized.slice(index, index + 2));
  }
  return parts.join(":");
}

export function buildAndroidApkCompatibility(release: AndroidApkRelease): AndroidApkCompatibility {
  const trustedPackageName = String(process.env.ANDROID_APK_TRUSTED_PACKAGE_NAME ?? "").trim() || DEFAULT_ANDROID_PACKAGE;
  const trustedSigningFromEnv = String(process.env.ANDROID_APK_TRUSTED_SIGNING_SHA256 ?? "").trim();

  const trustedSigningKeySha256 = normalizeSigningFingerprint(trustedSigningFromEnv || release.signingKeySha256);
  const releaseSigningFingerprint = normalizeSigningFingerprint(release.signingKeySha256);
  const samePackageName = release.packageName === trustedPackageName;
  const sameSigningKey = Boolean(trustedSigningKeySha256 && releaseSigningFingerprint && trustedSigningKeySha256 === releaseSigningFingerprint);

  return {
    trustedPackageName,
    trustedSigningKeySha256,
    samePackageName,
    sameSigningKey,
    canInstallOverExisting: samePackageName && sameSigningKey,
  };
}

export function getDefaultAndroidReleasePayload(): AndroidApkReleasePayload {
  return {
    ok: true,
    release: DEFAULT_ANDROID_APK_RELEASE,
    compatibility: buildAndroidApkCompatibility(DEFAULT_ANDROID_APK_RELEASE),
  };
}
