"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
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
  riskyInstallerApps?: string[];
  heuristicRiskyApps?: string[];
  highRiskPackageKeywordApps?: string[];
  adwareLikeApps?: string[];
  gameLikeApps?: string[];
  unknownInstallerCount?: number;
  heuristicRiskyAppCount?: number;
  adwareLikeCount?: number;
  gameLikeCount?: number;
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
  installerOpened?: boolean;
  downloadsOpened?: boolean;
  message?: string;
};

export type VaultShieldApkInstallEvent = {
  status?: "installer_opened" | "installer_blocked" | "installer_error" | "download_failed" | string;
  message?: string;
  fileName?: string;
  downloadId?: number;
  requiresUserAction?: boolean;
  settingsOpened?: boolean;
  installerOpened?: boolean;
  downloadsOpened?: boolean;
};

export type VaultShieldOpenPendingApkResult = {
  status?: "installer_opened" | "installer_blocked" | "no_pending_apk" | string;
  installerOpened?: boolean;
  downloadsOpened?: boolean;
  fileName?: string;
  requiresUserAction?: boolean;
};

export type VaultShieldCameraPermissionResult = {
  status?: "granted" | "denied" | "denied_permanently" | string;
};

export type VaultShieldContactsPermissionResult = {
  status?: "granted" | "denied" | "denied_permanently" | string;
};

export type VaultShieldCallPermissionResult = {
  status?: "granted" | "denied" | "denied_permanently" | string;
};

export type VaultShieldDeviceContact = {
  id: string;
  name: string;
  number: string;
  label: "family" | "work" | "service" | "unknown";
};

export type VaultShieldDeviceContactsResult = {
  permission?: "granted" | "denied" | string;
  contacts?: VaultShieldDeviceContact[];
  count?: number;
  source?: "device" | string;
};

export type VaultShieldInstalledAppRisk = {
  packageName: string;
  appName: string;
  installer: string;
  riskScore: number;
  riskLevel: "safe" | "review" | "risky" | "remove";
  recommendation: "allow" | "verify" | "uninstall";
  dangerousPermissionCount: number;
  hasSmsPermission: boolean;
  accessibilityEnabled: boolean;
  deviceAdminActive: boolean;
  canDisplayOverlay: boolean;
  notificationAccessEnabled: boolean;
  canInstallPackages: boolean;
  bootAutoStart: boolean;
  hasSuspiciousKeyword: boolean;
  networkRxBytes: number;
  networkTxBytes: number;
  reasons: string[];
  requestedPermissions: string[];
};

export type VaultShieldAppScanResult = {
  scannedAt: string;
  count: number;
  apps: VaultShieldInstalledAppRisk[];
};

export type VaultShieldDeviceSecurityState = {
  collectedAt: string;
  playProtectEnabled: boolean;
  securityPatchLevel: string;
  unknownSourcesEnabled: boolean;
  developerOptionsEnabled: boolean;
  adbEnabled: boolean;
  vpnActive: boolean;
  activeWifi: boolean;
  overlayPermissionGrantedToVault: boolean;
  suBinaryDetected: boolean;
  hasTestKeys: boolean;
};

export type VaultShieldBiometricStatus = {
  supported: boolean;
  available: boolean;
  enrolled: boolean;
  android12OrNewer: boolean;
  apiLevel: number;
  statusCode?: number;
  reason?:
    | "ready"
    | "android_version_unsupported"
    | "hardware_unavailable"
    | "none_enrolled"
    | "security_update_required"
    | "unsupported"
    | "unknown";
};

export type VaultShieldBiometricAuthResult = {
  success: boolean;
  status:
    | "authenticated"
    | "unsupported"
    | "hardware_unavailable"
    | "none_enrolled"
    | "user_cancel"
    | "negative_button"
    | "lockout"
    | "lockout_permanent"
    | "timeout"
    | "error"
    | "android_version_unsupported";
  errorCode?: number;
  errorMessage?: string;
  fallbackToPin?: boolean;
};

type VaultShieldPlugin = {
  collectSignals(options?: VaultShieldCollectOptions): Promise<VaultShieldSignals>;
  installApkUpdate(options: VaultShieldInstallApkOptions): Promise<VaultShieldInstallApkResult>;
  openPendingApkInstaller(): Promise<VaultShieldOpenPendingApkResult>;
  requestCameraPermission(): Promise<VaultShieldCameraPermissionResult>;
  requestContactsPermission(): Promise<VaultShieldContactsPermissionResult>;
  requestCallPhonePermission(): Promise<VaultShieldCallPermissionResult>;
  getDeviceContacts(options?: { limit?: number }): Promise<VaultShieldDeviceContactsResult>;
  scanInstalledApps(options?: { limit?: number }): Promise<VaultShieldAppScanResult>;
  getDeviceSecurityState(): Promise<VaultShieldDeviceSecurityState>;
  getBiometricStatus(): Promise<VaultShieldBiometricStatus>;
  authenticateBiometric(options?: {
    title?: string;
    subtitle?: string;
    negativeButtonText?: string;
  }): Promise<VaultShieldBiometricAuthResult>;
  openAppSettings(): Promise<{ opened?: boolean }>;
  addListener(
    eventName: "apkInstallState",
    listenerFunc: (event: VaultShieldApkInstallEvent) => void,
  ): Promise<PluginListenerHandle> | PluginListenerHandle;
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

export async function openPendingAndroidApkInstaller(): Promise<VaultShieldOpenPendingApkResult | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    return await nativePlugin.openPendingApkInstaller();
  } catch (error) {
    console.error("VaultShield openPendingApkInstaller failed:", error);
    return null;
  }
}

export async function onVaultShieldApkInstallState(
  listener: (event: VaultShieldApkInstallEvent) => void,
): Promise<(() => Promise<void>) | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    const handle = await nativePlugin.addListener("apkInstallState", listener);
    return async function removeListener() {
      try {
        await handle.remove();
      } catch {
        // ignore
      }
    };
  } catch (error) {
    console.error("VaultShield apkInstallState listener failed:", error);
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

export async function requestVaultShieldContactsPermission(): Promise<"granted" | "denied" | "denied_permanently" | "unknown"> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return "unknown";
  }

  try {
    const result = await nativePlugin.requestContactsPermission();
    const status = String(result?.status ?? "").toLowerCase();
    if (status === "granted" || status === "denied" || status === "denied_permanently") {
      return status;
    }
    return "unknown";
  } catch (error) {
    console.error("VaultShield requestContactsPermission failed:", error);
    return "unknown";
  }
}

export async function requestVaultShieldCallPhonePermission(): Promise<"granted" | "denied" | "denied_permanently" | "unknown"> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return "unknown";
  }

  try {
    const result = await nativePlugin.requestCallPhonePermission();
    const status = String(result?.status ?? "").toLowerCase();
    if (status === "granted" || status === "denied" || status === "denied_permanently") {
      return status;
    }
    return "unknown";
  } catch (error) {
    console.error("VaultShield requestCallPhonePermission failed:", error);
    return "unknown";
  }
}

export async function readVaultShieldDeviceContacts(limit = 300): Promise<VaultShieldDeviceContactsResult | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    const result = await nativePlugin.getDeviceContacts({ limit });
    return result ?? null;
  } catch (error) {
    console.error("VaultShield getDeviceContacts failed:", error);
    return null;
  }
}

export async function scanVaultShieldInstalledApps(limit = 240): Promise<VaultShieldAppScanResult | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    return await nativePlugin.scanInstalledApps({ limit });
  } catch (error) {
    console.error("VaultShield scanInstalledApps failed:", error);
    return null;
  }
}

export async function readVaultShieldDeviceSecurityState(): Promise<VaultShieldDeviceSecurityState | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    return await nativePlugin.getDeviceSecurityState();
  } catch (error) {
    console.error("VaultShield getDeviceSecurityState failed:", error);
    return null;
  }
}

export async function readVaultShieldBiometricStatus(): Promise<VaultShieldBiometricStatus | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    return await nativePlugin.getBiometricStatus();
  } catch (error) {
    console.error("VaultShield getBiometricStatus failed:", error);
    return null;
  }
}

export async function authenticateVaultShieldBiometric(options?: {
  title?: string;
  subtitle?: string;
  negativeButtonText?: string;
}): Promise<VaultShieldBiometricAuthResult | null> {
  const capabilities = detectRuntimeCapabilities();
  if (!capabilities.isCapacitorNative || !capabilities.isAndroid) {
    return null;
  }

  try {
    return await nativePlugin.authenticateBiometric(options);
  } catch (error) {
    console.error("VaultShield authenticateBiometric failed:", error);
    return null;
  }
}
