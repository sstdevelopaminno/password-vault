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

type VaultShieldPlugin = {
  collectSignals(options?: VaultShieldCollectOptions): Promise<VaultShieldSignals>;
  installApkUpdate(options: VaultShieldInstallApkOptions): Promise<VaultShieldInstallApkResult>;
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
