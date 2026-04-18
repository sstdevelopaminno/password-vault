"use client";

import { registerPlugin } from "@capacitor/core";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";

export type VaultShieldSignals = {
  platform: "android";
  collectedAt: string;
  apiLevel: number;
  packageName: string;
  installSource?: string;
  isEmulator: boolean;
  isDebuggable: boolean;
  hasTestKeys: boolean;
  suBinaryDetected: boolean;
  developerOptionsEnabled: boolean;
  adbEnabled: boolean;
  vpnActive: boolean;
  suspiciousApps: string[];
  packageVisibilityLimited: boolean;
  queryAllPackagesDeclared: boolean;
  scanMode: "explicit-package-check" | "launcher-intent";
  playIntegrityStatus?: "ok" | "error" | "skipped";
  playIntegrityToken?: string;
  playIntegrityError?: string;
  playIntegrityErrorCode?: number;
};

export type VaultShieldCollectOptions = {
  suspiciousPackages?: string[];
  scanLaunchableApps?: boolean;
  playIntegrityNonce?: string;
  playIntegrityCloudProjectNumber?: number;
};

export type VaultShieldInstallApkOptions = {
  downloadUrl: string;
  title?: string;
  description?: string;
  fileName?: string;
};

export type VaultShieldInstallApkResult = {
  status?: "downloading" | "permission_required" | string;
  downloadId?: number;
  fileName?: string;
  requiresUserAction?: boolean;
  settingsOpened?: boolean;
  message?: string;
};

export type VaultShieldCameraPermissionResult = {
  status?: "granted" | "denied" | "denied_permanently" | string;
};

type VaultShieldPlugin = {
  collectSignals(options?: VaultShieldCollectOptions): Promise<VaultShieldSignals>;
  installApkUpdate(options: VaultShieldInstallApkOptions): Promise<VaultShieldInstallApkResult>;
  requestCameraPermission(): Promise<VaultShieldCameraPermissionResult>;
  openAppSettings(): Promise<{ opened?: boolean }>;
};

const nativePlugin = registerPlugin<VaultShieldPlugin>("VaultShield");

const DEFAULT_ANDROID_RISK_PACKAGES = [
  "com.topjohnwu.magisk",
  "com.devadvance.rootcloak2",
  "de.robv.android.xposed.installer",
  "com.cih.game_cih",
  "eu.chainfire.supersu",
  "com.noshufou.android.su",
];

function parseConfiguredRiskPackages() {
  const csv = String(process.env.NEXT_PUBLIC_VAULT_SHIELD_SUSPICIOUS_PACKAGES ?? "");
  const fromEnv = csv
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!fromEnv.length) {
    return DEFAULT_ANDROID_RISK_PACKAGES;
  }

  return Array.from(new Set([...DEFAULT_ANDROID_RISK_PACKAGES, ...fromEnv]));
}

export function getConfiguredAndroidRiskPackages() {
  return parseConfiguredRiskPackages();
}

export function getPlayIntegrityCloudProjectNumber() {
  const raw = String(process.env.NEXT_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER ?? "").trim();
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric <= 0) return undefined;
  return Math.floor(numeric);
}

export function createPlayIntegrityNonce() {
  if (typeof window === "undefined" || typeof window.crypto === "undefined") {
    return "";
  }

  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);

  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function collectVaultShieldSignals(
  options: VaultShieldCollectOptions = {},
): Promise<VaultShieldSignals | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  const suspiciousPackages = options.suspiciousPackages?.length
    ? options.suspiciousPackages
    : parseConfiguredRiskPackages();

  try {
    return await nativePlugin.collectSignals({
      suspiciousPackages,
      scanLaunchableApps: options.scanLaunchableApps ?? true,
      playIntegrityNonce: options.playIntegrityNonce,
      playIntegrityCloudProjectNumber: options.playIntegrityCloudProjectNumber,
    });
  } catch (error) {
    console.error("VaultShield collectSignals failed:", error);
    return null;
  }
}

export async function installAndroidApkUpdate(
  options: VaultShieldInstallApkOptions,
): Promise<VaultShieldInstallApkResult | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    return await nativePlugin.installApkUpdate(options);
  } catch (error) {
    console.error("VaultShield installApkUpdate failed:", error);
    return null;
  }
}

export async function requestVaultShieldCameraPermission(): Promise<"granted" | "denied" | "denied_permanently" | "unknown"> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return "unknown";
  }

  try {
    const result = await nativePlugin.requestCameraPermission();
    const status = String(result?.status ?? "").toLowerCase();
    if (status === "granted" || status === "denied" || status === "denied_permanently") {
      return status;
    }
    return "unknown";
  } catch (error) {
    console.error("VaultShield requestCameraPermission failed:", error);
    return "unknown";
  }
}

export async function openVaultShieldAppSettings(): Promise<boolean> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return false;
  }

  try {
    const result = await nativePlugin.openAppSettings();
    return Boolean(result?.opened);
  } catch (error) {
    console.error("VaultShield openAppSettings failed:", error);
    return false;
  }
}
