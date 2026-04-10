export const APP_ICON_192 = "/icons/icon-192.svg";
export const APP_ICON_512 = "/icons/icon-512.svg";
export const APP_ICON_MASKABLE = "/icons/maskable.svg";

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

export type RuntimePlatformMode = "android-pwa" | "ios-home-screen" | "browser-tab";

export type RuntimeCapabilities = {
  mode: RuntimePlatformMode;
  displayStandalone: boolean;
  isAndroid: boolean;
  isIos: boolean;
  serviceWorkerSupported: boolean;
  notificationsSupported: boolean;
  pushManagerSupported: boolean;
  badgingSupported: boolean;
  manualInstallRecommended: boolean;
};

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

  let mode: RuntimePlatformMode = "browser-tab";
  if (isIos && displayStandalone) {
    mode = "ios-home-screen";
  } else if (isAndroid && displayStandalone) {
    mode = "android-pwa";
  }

  return {
    mode: mode,
    displayStandalone: displayStandalone,
    isAndroid: isAndroid,
    isIos: isIos,
    serviceWorkerSupported: "serviceWorker" in navigator,
    notificationsSupported: typeof Notification !== "undefined",
    pushManagerSupported: "PushManager" in window,
    badgingSupported: "setAppBadge" in navigator || "clearAppBadge" in navigator,
    manualInstallRecommended: isIos && !displayStandalone,
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

  return isThai ? "Browser Tab" : "Browser Tab";
}

export function isManagedRuntimeCacheName(name: string) {
  return name.startsWith("pv-static-") || name.startsWith("pv-pages-");
}
