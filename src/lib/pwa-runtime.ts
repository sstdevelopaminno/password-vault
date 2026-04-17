export const APP_ICON_192 = "/icons/icon-192.png";
export const APP_ICON_512 = "/icons/icon-512.png";
export const APP_ICON_MASKABLE = "/icons/maskable-512.png";

export const NOTIFICATION_SETTINGS_STORAGE_KEY = "pv_notification_settings_v1";
export const VERSION_SEEN_STORAGE_KEY = "pv_seen_app_version";
export const RUNTIME_BUILD_MARKER_STORAGE_KEY = "pv_runtime_build_marker";
export const RUNTIME_SCHEMA_STORAGE_KEY = "pv_runtime_schema_version";
export const RUNTIME_UPDATE_NOTICE_STORAGE_KEY = "pv_runtime_update_notice_seen";
export const PIN_SESSION_STORAGE_PREFIX = "pv_pin_unlock_";
export const RUNTIME_DIAGNOSTICS_ENDPOINT = "/api/runtime/diagnostics";

export const RUNTIME_SCHEMA_VERSION = "pwa-runtime-v2";

export const RUNTIME_LOCAL_STORAGE_KEYS_TO_RESET = [
  VERSION_SEEN_STORAGE_KEY,
  RUNTIME_UPDATE_NOTICE_STORAGE_KEY,
];

export type RuntimePlatformMode = "android-pwa" | "ios-home-screen" | "browser-tab" | "capacitor-native";

export type RuntimeCapabilities = {
  mode: RuntimePlatformMode;
  displayStandalone: boolean;
  isAndroid: boolean;
  isIos: boolean;
  isCapacitorNative: boolean;
  androidMajorVersion?: number;
  iosMajorVersion?: number;
  iosMinorVersion?: number;
  android14OrNewer: boolean;
  iosHomeScreenPushSupported: boolean;
  iosHomeScreenPushReady: boolean;
  serviceWorkerSupported: boolean;
  notificationsSupported: boolean;
  pushManagerSupported: boolean;
  badgingSupported: boolean;
  manualInstallRecommended: boolean;
};

function parseAndroidMajorVersion(userAgent: string) {
  const matched = userAgent.match(/android\s+(\d+)/i);
  if (!matched) return undefined;
  const version = Number(matched[1]);
  if (!Number.isFinite(version)) return undefined;
  return version;
}

function parseIosVersion(userAgent: string) {
  const matched = userAgent.match(/os\s+(\d+)[._](\d+)/i);
  if (!matched) return { major: undefined, minor: undefined };
  const major = Number(matched[1]);
  const minor = Number(matched[2]);
  return {
    major: Number.isFinite(major) ? major : undefined,
    minor: Number.isFinite(minor) ? minor : undefined,
  };
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;

  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function detectRuntimeCapabilities(): RuntimeCapabilities {
  if (typeof window === "undefined") {
    return {
      mode: "browser-tab",
      displayStandalone: false,
      isAndroid: false,
      isIos: false,
      isCapacitorNative: false,
      androidMajorVersion: undefined,
      iosMajorVersion: undefined,
      iosMinorVersion: undefined,
      android14OrNewer: false,
      iosHomeScreenPushSupported: false,
      iosHomeScreenPushReady: false,
      serviceWorkerSupported: false,
      notificationsSupported: false,
      pushManagerSupported: false,
      badgingSupported: false,
      manualInstallRecommended: false,
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = ["iphone", "ipad", "ipod"].some(function (token) {
    return userAgent.includes(token);
  });
  const isAndroid = userAgent.includes("android");
  const displayStandalone = isStandaloneDisplay();
  const capacitor = window as typeof window & {
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
  };
  const isCapacitorNative = Boolean(capacitor.Capacitor?.isNativePlatform?.());
  const androidMajorVersion = parseAndroidMajorVersion(userAgent);
  const iosVersion = parseIosVersion(userAgent);
  const android14OrNewer = Boolean(isAndroid && androidMajorVersion && androidMajorVersion >= 14);
  const iosHomeScreenPushSupported = Boolean(
    isIos &&
    iosVersion.major &&
    (
      iosVersion.major > 16 ||
      (iosVersion.major === 16 && (iosVersion.minor ?? 0) >= 4)
    ),
  );
  const iosHomeScreenPushReady = Boolean(iosHomeScreenPushSupported && displayStandalone);

  let mode: RuntimePlatformMode = "browser-tab";
  if (isCapacitorNative) {
    mode = "capacitor-native";
  } else if (isIos && displayStandalone) {
    mode = "ios-home-screen";
  } else if (isAndroid && displayStandalone) {
    mode = "android-pwa";
  }

  return {
    mode: mode,
    displayStandalone: displayStandalone,
    isAndroid: isAndroid,
    isIos: isIos,
    isCapacitorNative: isCapacitorNative,
    androidMajorVersion: androidMajorVersion,
    iosMajorVersion: iosVersion.major,
    iosMinorVersion: iosVersion.minor,
    android14OrNewer: android14OrNewer,
    iosHomeScreenPushSupported: iosHomeScreenPushSupported,
    iosHomeScreenPushReady: iosHomeScreenPushReady,
    serviceWorkerSupported: "serviceWorker" in navigator,
    notificationsSupported: typeof Notification !== "undefined",
    pushManagerSupported: "PushManager" in window,
    badgingSupported: "setAppBadge" in navigator || "clearAppBadge" in navigator,
    manualInstallRecommended: !displayStandalone && !isCapacitorNative && (isIos || isAndroid),
  };
}

export function getRuntimeModeLabel(mode: RuntimePlatformMode, locale: string) {
  const isThai = locale === "th";

  if (mode === "android-pwa") {
    return isThai ? "Android PWA" : "Android PWA";
  }

  if (mode === "ios-home-screen") {
    return isThai ? "iPhone Home Screen" : "iPhone Home Screen";
  }

  if (mode === "capacitor-native") {
    return isThai ? "Native App (Capacitor)" : "Native App (Capacitor)";
  }

  return isThai ? "Browser Tab" : "Browser Tab";
}

export function isManagedRuntimeCacheName(name: string) {
  return name.startsWith("pv-static-") || name.startsWith("pv-pages-");
}
