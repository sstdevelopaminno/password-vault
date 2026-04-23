"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, RefreshCw, Smartphone, X } from "lucide-react";
import { useHeadsUpNotifications } from "@/components/notifications/heads-up-provider";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";
import { consumeReminderQuota } from "@/lib/install-reminder";
import { UPDATE_DETAILS_PATH, getReleaseUpdateDetail } from "@/lib/release-update";
import {
  PIN_SESSION_STORAGE_PREFIX,
  RUNTIME_BUILD_MARKER_STORAGE_KEY,
  RUNTIME_LOCAL_STORAGE_KEYS_TO_RESET,
  RUNTIME_SCHEMA_STORAGE_KEY,
  RUNTIME_SCHEMA_VERSION,
  RUNTIME_UPDATE_NOTICE_STORAGE_KEY,
  detectRuntimeCapabilities,
  getRuntimeModeLabel,
  isManagedRuntimeCacheName,
  type RuntimeCapabilities,
} from "@/lib/pwa-runtime";
import { postRuntimeDiagnostic } from "@/lib/runtime-diagnostics";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
};

type VersionPayload = {
  ok?: boolean;
  appVersion?: string;
  marker?: string;
  schemaVersion?: string;
};

type TopQuickActionsProps = {
  variant?: "toolbar" | "settings-menu";
  showSecondaryActions?: boolean;
  showRuntimeWhenNoUpdate?: boolean;
};

const PWA_INSTALL_REMINDER_KEY = "pv_pwa_install_reminder_v1";
const PWA_INSTALL_REMINDER_MAX_PER_DAY = 2;
const PWA_INSTALL_REMINDER_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

function defaultVersionPayload(): VersionPayload {
  return { marker: APP_VERSION, schemaVersion: RUNTIME_SCHEMA_VERSION };
}

async function fetchRuntimeVersion(): Promise<VersionPayload> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    const body = (await response.json().catch(function () {
      return {};
    })) as VersionPayload;
    if (!response.ok) return defaultVersionPayload();

    return {
      ok: body.ok,
      appVersion: body.appVersion ?? APP_VERSION,
      marker: String(body.marker ?? body.appVersion ?? APP_VERSION).trim(),
      schemaVersion: String(body.schemaVersion ?? RUNTIME_SCHEMA_VERSION).trim(),
    };
  } catch {
    return defaultVersionPayload();
  }
}

function shortMarker(value?: string) {
  if (!value) return "-";
  return value.length <= 12 ? value : value.slice(0, 12);
}

function getCapabilityValue(enabled: boolean, locale: string) {
  if (enabled) return locale === "th" ? "พร้อมใช้งาน" : "Available";
  return locale === "th" ? "ไม่พร้อม" : "Unavailable";
}

function getInstallValue(capabilities: RuntimeCapabilities, hasInstallPrompt: boolean, locale: string) {
  if (hasInstallPrompt) {
    return locale === "th" ? "พร้อมติดตั้งจากปุ่ม Install" : "Install prompt is available";
  }

  if (capabilities.manualInstallRecommended) {
    if (capabilities.isAndroid) {
      return locale === "th"
        ? "ติดตั้งจากเมนู Chrome > Install app / Add to Home screen"
        : "Install from Chrome menu > Install app / Add to Home screen";
    }
    if (capabilities.isIos) {
      return locale === "th"
        ? "ติดตั้งจาก Safari > Share > Add to Home Screen"
        : "Install from Safari > Share > Add to Home Screen";
    }
    return locale === "th" ? "ติดตั้งจากเมนูเบราว์เซอร์" : "Install from browser menu";
  }

  if (capabilities.isCapacitorNative) {
    return locale === "th" ? "กำลังรันเป็นแอปที่ติดตั้งแล้ว (Capacitor)" : "Running as installed native app (Capacitor)";
  }

  return locale === "th" ? "กำลังรันบนแท็บเบราว์เซอร์" : "Running in browser tab";
}

function getModeTone(mode: RuntimeCapabilities["mode"]) {
  if (mode === "android-pwa") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (mode === "ios-home-screen") return "border-sky-200 bg-sky-50 text-sky-800";
  if (mode === "capacitor-native") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getAndroid14StatusValue(capabilities: RuntimeCapabilities, locale: string) {
  if (!capabilities.isAndroid) {
    return locale === "th" ? "ไม่ใช่อุปกรณ์ Android" : "Not an Android device";
  }
  const major = capabilities.androidMajorVersion;
  if (!major) {
    return locale === "th" ? "ไม่ทราบเวอร์ชัน Android" : "Android version unknown";
  }
  if (major >= 14) {
    return locale === "th" ? `ผ่านเกณฑ์ (Android ${major})` : `Pass (Android ${major})`;
  }
  return locale === "th" ? `ต่ำกว่าเป้าหมาย (Android ${major})` : `Below target (Android ${major})`;
}

function getIosPushStatusValue(capabilities: RuntimeCapabilities, locale: string) {
  if (!capabilities.isIos) {
    return locale === "th" ? "ไม่ใช่อุปกรณ์ iOS" : "Not an iOS device";
  }
  const major = capabilities.iosMajorVersion;
  const minor = capabilities.iosMinorVersion;
  const versionLabel = typeof major === "number" ? `${major}.${typeof minor === "number" ? minor : 0}` : "-";

  if (!capabilities.iosHomeScreenPushSupported) {
    return locale === "th"
      ? `ต้องใช้ iOS 16.4 ขึ้นไป (ปัจจุบัน ${versionLabel})`
      : `Requires iOS 16.4+ (current ${versionLabel})`;
  }
  if (!capabilities.displayStandalone) {
    return locale === "th"
      ? `รองรับบน iOS ${versionLabel} ติดตั้งลง Home Screen เพื่อเปิดใช้งาน`
      : `Supported on iOS ${versionLabel}, install to Home Screen to enable`;
  }
  return locale === "th" ? `พร้อมใช้งาน (iOS ${versionLabel})` : `Ready (iOS ${versionLabel})`;
}

async function clearUpdateData(nextVersion: VersionPayload) {
  if (typeof window === "undefined") return;

  const nextMarker = nextVersion.marker ?? APP_VERSION;
  const nextSchemaVersion = nextVersion.schemaVersion ?? RUNTIME_SCHEMA_VERSION;
  const storedSchemaVersion = window.localStorage.getItem(RUNTIME_SCHEMA_STORAGE_KEY);
  const schemaChanged = Boolean(storedSchemaVersion && storedSchemaVersion !== nextSchemaVersion);
  const localKeysToRemove = schemaChanged ? RUNTIME_LOCAL_STORAGE_KEYS_TO_RESET : [RUNTIME_UPDATE_NOTICE_STORAGE_KEY];

  try {
    for (const key of localKeysToRemove) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(RUNTIME_BUILD_MARKER_STORAGE_KEY, nextMarker);
    window.localStorage.setItem(RUNTIME_SCHEMA_STORAGE_KEY, nextSchemaVersion);
  } catch {
    // ignore storage failures
  }

  if (schemaChanged) {
    try {
      const removableSessionKeys: string[] = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key && key.startsWith(PIN_SESSION_STORAGE_PREFIX)) {
          removableSessionKeys.push(key);
        }
      }

      for (const key of removableSessionKeys) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // ignore session cleanup failures
    }
  }

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const activeWorker = registration?.active ?? registration?.waiting ?? registration?.installing;
      activeWorker?.postMessage({ type: "PURGE_APP_CACHE" });
    } catch {
      // ignore worker cleanup failures
    }
  }

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      const removable = cacheNames.filter(function (name) {
        return isManagedRuntimeCacheName(name);
      });
      await Promise.all(removable.map(function (name) {
        return caches.delete(name);
      }));
    } catch {
      // ignore cache cleanup failures
    }
  }
}

export function TopQuickActions({
  variant = "toolbar",
  showSecondaryActions = true,
  showRuntimeWhenNoUpdate = true,
}: TopQuickActionsProps) {
  const { locale } = useI18n();
  const toast = useToast();
  const { notify } = useHeadsUpNotifications();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showInstallHelpCard, setShowInstallHelpCard] = useState(false);
  const [showRuntimeCard, setShowRuntimeCard] = useState(false);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>(detectRuntimeCapabilities);
  const [versionInfo, setVersionInfo] = useState<VersionPayload>(defaultVersionPayload);
  const pendingVersionRef = useRef<VersionPayload | null>(null);
  const capabilitiesRef = useRef<RuntimeCapabilities>(capabilities);
  const bootDiagnosticsSentRef = useRef(false);

  const text = useMemo(function () {
    if (locale === "th") {
      return {
        install: "ติดตั้งแอป",
        update: "อัปเดตแอป",
        updating: "กำลังอัปเดต...",
        ready: "มีอัปเดตใหม่พร้อมติดตั้ง",
        done: "อัปเดตแล้ว กำลังโหลดใหม่",
        failed: "อัปเดตไม่สำเร็จ",
        viewRuntime: "ดูสถานะระบบ",
        runtimeTitle: "สถานะการรันบนเครื่องนี้",
        runtimeDescription: "แสดงโหมดการรัน ความสามารถของ runtime และข้อมูล build/schema ปัจจุบัน",
        currentBuild: "บิลด์ปัจจุบัน",
        pendingBuild: "บิลด์ที่รออัปเดต",
        schema: "สคีมารันไทม์",
        updateScope: "ขอบเขตการล้างข้อมูลตอนอัปเดต",
        updateScopeDetail: "ล้างเฉพาะ runtime cache เก่าและ state ชั่วคราวที่เกี่ยวกับ runtime; ค่าตั้งค่าแจ้งเตือนและข้อมูล local ที่ยังใช้ได้จะถูกเก็บไว้",
        installMethod: "วิธีติดตั้ง",
        serviceWorker: "Service Worker",
        notifications: "Notifications",
        push: "Push",
        badge: "Badge",
        close: "ปิด",
        updateReadyLabel: "มีอัปเดต",
        liveLabel: "กำลังใช้งาน",
        runtimeReadyTitle: "ตรวจพบเวอร์ชันใหม่",
        runtimeReadyMessage: "มีบิลด์ใหม่พร้อมใช้งาน กดอัปเดตเพื่อโหลดโค้ดล่าสุดโดยไม่ล้าง state ที่ยังใช้ได้",
        runtimeReadyDetail: "ระบบจะเคลียร์เฉพาะ cache เก่าและ state ชั่วคราวที่ขึ้นกับ build/schema เท่านั้น",
        iosTitle: "ติดตั้งบน iPhone หรือ iPad",
        iosDetail: "เปิดแอปนี้ด้วย Safari แตะ Share แล้วเลือก Add to Home Screen",
        iosStep1: "1) เปิดหน้านี้ใน Safari",
        iosStep2: "2) แตะปุ่ม Share",
        iosStep3: "3) เลือก Add to Home Screen",
        iosStep4: "4) แตะ Add เพื่อเสร็จสิ้น",
      };
    }

    return {
      install: "Install App",
      update: "Update",
      updating: "Updating...",
      ready: "New update is ready",
      done: "Updated, reloading",
      failed: "Update failed",
      viewRuntime: "Runtime status",
      runtimeTitle: "Runtime status on this device",
      runtimeDescription: "Shows runtime mode, platform capabilities, and the active build/schema marker.",
      currentBuild: "Current build",
      pendingBuild: "Pending build",
      schema: "Runtime schema",
      updateScope: "Update invalidation scope",
      updateScopeDetail: "Only stale runtime caches and temporary runtime state are cleared. Notification settings and still-valid local state stay in place.",
      installMethod: "Install method",
      serviceWorker: "Service Worker",
      notifications: "Notifications",
      push: "Push",
      badge: "Badge",
      close: "Close",
      updateReadyLabel: "Update ready",
      liveLabel: "Live",
      runtimeReadyTitle: "New build detected",
      runtimeReadyMessage: "A new build is available. Tap Update to load the latest code without clearing still-valid state.",
      runtimeReadyDetail: "Only stale caches and build/schema-bound temporary state will be invalidated.",
      iosTitle: "Install on iPhone or iPad",
      iosDetail: "Open this app in Safari, tap Share, then choose Add to Home Screen",
      iosStep1: "1) Open this page in Safari",
      iosStep2: "2) Tap the Share button",
      iosStep3: "3) Choose Add to Home Screen",
      iosStep4: "4) Tap Add to finish",
    };
  }, [locale]);

  const runtimeModeLabel = getRuntimeModeLabel(capabilities.mode, locale);
  const installHelp = useMemo(function () {
    const isThai = locale === "th";
    if (capabilities.isAndroid && !capabilities.displayStandalone && !capabilities.isCapacitorNative) {
      return {
        title: isThai ? "ติดตั้งบน Android" : "Install on Android",
        detail: isThai
          ? "เปิดแอปนี้ใน Chrome แตะเมนูสามจุด แล้วเลือก Install app หรือ Add to Home screen"
          : "Open this app in Chrome, tap the three-dot menu, then choose Install app or Add to Home screen.",
        steps: [
          isThai ? "1) เปิดหน้านี้ใน Chrome" : "1) Open this page in Chrome",
          isThai ? "2) แตะเมนูสามจุด" : "2) Tap the three-dot menu",
          isThai ? "3) เลือก Install app หรือ Add to Home screen" : "3) Select Install app or Add to Home screen",
          isThai ? "4) แตะ Install/Add เพื่อเสร็จสิ้น" : "4) Tap Install/Add to finish",
        ],
      };
    }

    if (capabilities.isIos && !capabilities.displayStandalone && !capabilities.isCapacitorNative) {
      return {
        title: text.iosTitle,
        detail: text.iosDetail,
        steps: [text.iosStep1, text.iosStep2, text.iosStep3, text.iosStep4],
      };
    }

    return {
      title: isThai ? "ติดตั้งแอป" : "Install app",
      detail: isThai
        ? "อุปกรณ์นี้สามารถติดตั้งแอปผ่านเมนูติดตั้งของเบราว์เซอร์ได้"
        : "This device can install the app from the browser install menu.",
      steps: [
        isThai ? "1) เปิดเมนูเบราว์เซอร์" : "1) Open your browser menu",
        isThai ? "2) เลือก Install app / Add to Home screen" : "2) Choose Install app / Add to Home screen",
        isThai ? "3) ยืนยันการติดตั้ง" : "3) Confirm installation",
      ],
    };
  }, [capabilities.displayStandalone, capabilities.isAndroid, capabilities.isCapacitorNative, capabilities.isIos, locale, text.iosDetail, text.iosStep1, text.iosStep2, text.iosStep3, text.iosStep4, text.iosTitle]);

  const hasInstallPrompt = Boolean(installPrompt);
  const showInstallAction = hasInstallPrompt || capabilities.manualInstallRecommended;
  const showInstallButton = showSecondaryActions && showInstallAction;
  const showUpdateButton = showSecondaryActions && hasUpdate;
  const isSettingsMenu = variant === "settings-menu";
  const showRuntimeButton = isSettingsMenu || hasUpdate || showRuntimeWhenNoUpdate;
  const actionRowClass = isSettingsMenu
    ? (showSecondaryActions
      ? "flex w-full flex-wrap items-center gap-2"
      : "w-full")
    : "flex flex-wrap items-center justify-end gap-2";
  const runtimeButtonClass = isSettingsMenu
    ? "group flex min-h-[66px] w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:shadow-[0_12px_26px_rgba(37,99,235,0.12)]"
    : "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold shadow-[0_6px_20px_rgba(90,114,168,0.12)] transition active:scale-[0.98] " + getModeTone(capabilities.mode);
  const runtimeStatusBadgeClass = isSettingsMenu
    ? "rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600"
    : "rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600";

  useEffect(function () {
    if (typeof window === "undefined") return;
    if (!capabilities.manualInstallRecommended || capabilities.displayStandalone || capabilities.isCapacitorNative) return;
    if (capabilities.isAndroid) return;
    if (hasInstallPrompt) return;

    const quotaGranted = consumeReminderQuota({
      storageKey: PWA_INSTALL_REMINDER_KEY,
      maxPerDay: PWA_INSTALL_REMINDER_MAX_PER_DAY,
      minIntervalMs: PWA_INSTALL_REMINDER_MIN_INTERVAL_MS,
    });
    if (!quotaGranted) return;
    setShowInstallHelpCard(true);

    notify({
      kind: "system",
      title: locale === "th" ? "แนะนำติดตั้งแอปบนเครื่องนี้" : "Install app on this device",
      message:
        locale === "th"
          ? "ตอนนี้ยังใช้งานผ่านเบราว์เซอร์อยู่ แนะนำติดตั้งแอปเพื่อความเสถียรของการแจ้งเตือนและระบบความปลอดภัย (ระบบจะแจ้งไม่เกินวันละ 2 ครั้ง)"
          : "You are currently running in a browser. Install the app for better notification and security stability (max 2 reminders per day).",
      details: installHelp.detail,
      persistent: true,
      alsoSystem: true,
    });
  }, [
    capabilities.displayStandalone,
    capabilities.isAndroid,
    capabilities.isCapacitorNative,
    capabilities.manualInstallRecommended,
    hasInstallPrompt,
    installHelp.detail,
    locale,
    notify,
  ]);

  useEffect(function () {
    capabilitiesRef.current = capabilities;
  }, [capabilities]);

  useEffect(function () {
    if (typeof window === "undefined") return;

    const nextCapabilities = detectRuntimeCapabilities();
    setCapabilities(nextCapabilities);

    if (!bootDiagnosticsSentRef.current) {
      bootDiagnosticsSentRef.current = true;
      void postRuntimeDiagnostic({
        event: "runtime_boot",
        marker: window.localStorage.getItem(RUNTIME_BUILD_MARKER_STORAGE_KEY) ?? undefined,
        schemaVersion: window.localStorage.getItem(RUNTIME_SCHEMA_STORAGE_KEY) ?? undefined,
        capabilities: nextCapabilities,
        installPromptAvailable: hasInstallPrompt,
        note: "top-quick-actions-mounted",
      });
    }
  }, [hasInstallPrompt]);

  useEffect(function () {
    if (!showRuntimeCard || typeof window === "undefined") return;

    void postRuntimeDiagnostic({
      event: "runtime_status_opened",
      marker: versionInfo.marker,
      schemaVersion: versionInfo.schemaVersion,
      capabilities: capabilitiesRef.current,
      installPromptAvailable: hasInstallPrompt,
      note: "runtime-card-opened",
    });
  }, [hasInstallPrompt, showRuntimeCard, versionInfo.marker, versionInfo.schemaVersion]);

  useEffect(function () {
    if (typeof window === "undefined") return;

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        setCapabilities(detectRuntimeCapabilities());
        if ("serviceWorker" in navigator) {
          void navigator.serviceWorker.getRegistration().then(function (registration) {
            return registration?.update();
          }).catch(function () {
            // ignore runtime update checks on visibility resume
          });
        }
      }

      void postRuntimeDiagnostic({
        event: "runtime_visibility_change",
        marker: versionInfo.marker,
        schemaVersion: versionInfo.schemaVersion,
        capabilities: capabilitiesRef.current,
        installPromptAvailable: hasInstallPrompt,
        visibilityState: document.visibilityState,
        note: "document-visibility-change",
      });
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return function () {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasInstallPrompt, versionInfo.marker, versionInfo.schemaVersion]);

  useEffect(function () {
    let mounted = true;
    let intervalId = 0;

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      void postRuntimeDiagnostic({
        event: "runtime_install_prompt_available",
        marker: versionInfo.marker,
        schemaVersion: versionInfo.schemaVersion,
        capabilities: capabilitiesRef.current,
        installPromptAvailable: true,
        note: "beforeinstallprompt-fired",
      });
    }

    function onInstalled() {
      setInstallPrompt(null);
      setShowInstallHelpCard(false);
      const nextCapabilities = detectRuntimeCapabilities();
      setCapabilities(nextCapabilities);
      void postRuntimeDiagnostic({
        event: "runtime_installed",
        marker: versionInfo.marker,
        schemaVersion: versionInfo.schemaVersion,
        capabilities: nextCapabilities,
        installPromptAvailable: false,
        note: "appinstalled-fired",
      });
    }

    async function syncRuntimeVersion(showToastWhenChanged: boolean) {
      const nextVersion = await fetchRuntimeVersion();
      if (!mounted) return;

      setVersionInfo(nextVersion);

      const currentMarker = window.localStorage.getItem(RUNTIME_BUILD_MARKER_STORAGE_KEY);
      const currentSchemaVersion = window.localStorage.getItem(RUNTIME_SCHEMA_STORAGE_KEY);
      const nextMarker = nextVersion.marker ?? APP_VERSION;
      const nextSchemaVersion = nextVersion.schemaVersion ?? RUNTIME_SCHEMA_VERSION;

      if (!currentMarker) {
        window.localStorage.setItem(RUNTIME_BUILD_MARKER_STORAGE_KEY, nextMarker);
        window.localStorage.setItem(RUNTIME_SCHEMA_STORAGE_KEY, nextSchemaVersion);
        return;
      }

      if (currentMarker === nextMarker && currentSchemaVersion === nextSchemaVersion) {
        return;
      }

      pendingVersionRef.current = nextVersion;
      setHasUpdate(true);

      if (showToastWhenChanged) {
        toast.showToast(text.ready);
      }

      const seenMarker = window.localStorage.getItem(RUNTIME_UPDATE_NOTICE_STORAGE_KEY);
      if (seenMarker !== nextMarker) {
        window.localStorage.setItem(RUNTIME_UPDATE_NOTICE_STORAGE_KEY, nextMarker);
        notify({
          kind: "system",
          title: text.runtimeReadyTitle,
          message: text.runtimeReadyMessage,
          details: getReleaseUpdateDetail(locale),
          href: UPDATE_DETAILS_PATH,
          persistent: true,
          alsoSystem: true,
        });
      }

      void postRuntimeDiagnostic({
        event: "runtime_update_ready",
        marker: nextMarker,
        schemaVersion: nextSchemaVersion,
        capabilities: capabilitiesRef.current,
        installPromptAvailable: Boolean(installPrompt),
        note: currentSchemaVersion !== nextSchemaVersion ? "schema-changed" : "build-changed",
      });
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then(function (registration) {
          if (!registration) return;

          if (registration.waiting) {
            setHasUpdate(true);
          }

          registration.addEventListener("updatefound", function () {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener("statechange", function () {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                setHasUpdate(true);
                toast.showToast(text.ready);
              }
            });
          });
        })
        .catch(function () {
          // ignore registration lookup failure
        });
    }

    void syncRuntimeVersion(false);
    intervalId = window.setInterval(function () {
      void syncRuntimeVersion(true);
    }, 90000);

    return function () {
      mounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installPrompt, locale, notify, text, toast, versionInfo.marker, versionInfo.schemaVersion]);

  async function runUpdate() {
    if (updating) return;

    setUpdating(true);
    try {
      if (typeof window === "undefined") return;

      let registration: ServiceWorkerRegistration | undefined;
      if ("serviceWorker" in navigator) {
        registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      }

      const nextVersion = await fetchRuntimeVersion();
      const nextMarker = nextVersion.marker ?? APP_VERSION;
      const nextSchemaVersion = nextVersion.schemaVersion ?? RUNTIME_SCHEMA_VERSION;
      const currentMarker = window.localStorage.getItem(RUNTIME_BUILD_MARKER_STORAGE_KEY);
      const currentSchemaVersion = window.localStorage.getItem(RUNTIME_SCHEMA_STORAGE_KEY);
      const markerChanged = Boolean(
        currentMarker &&
        (currentMarker !== nextMarker || currentSchemaVersion !== nextSchemaVersion),
      );
      const waitingWorker = Boolean(registration?.waiting);
      const updateReady = hasUpdate || markerChanged || waitingWorker;

      setVersionInfo(nextVersion);
      if (!currentMarker) {
        window.localStorage.setItem(RUNTIME_BUILD_MARKER_STORAGE_KEY, nextMarker);
        window.localStorage.setItem(RUNTIME_SCHEMA_STORAGE_KEY, nextSchemaVersion);
      }

      if (!updateReady) {
        pendingVersionRef.current = null;
        setHasUpdate(false);
        toast.showToast(locale === "th" ? "คุณกำลังใช้เวอร์ชันล่าสุดแล้ว" : "Already on the latest version");
        return;
      }

      pendingVersionRef.current = nextVersion;
      setHasUpdate(true);

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise<void>(function (resolve) {
          let finished = false;
          const timer = window.setTimeout(function () {
            if (finished) return;
            finished = true;
            resolve();
          }, 3500);

          navigator.serviceWorker.addEventListener("controllerchange", function () {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }

      await clearUpdateData(nextVersion);
      setVersionInfo(nextVersion);
      setHasUpdate(false);

      void postRuntimeDiagnostic({
        event: "runtime_update_applied",
        marker: nextVersion.marker ?? APP_VERSION,
        schemaVersion: nextVersion.schemaVersion ?? RUNTIME_SCHEMA_VERSION,
        capabilities: capabilitiesRef.current,
        installPromptAvailable: hasInstallPrompt,
        note: "reload-requested",
      });

      toast.showToast(text.done);

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("pv_update", String(Date.now()));
      window.location.replace(nextUrl.toString());
    } catch {
      toast.showToast(text.failed, "error");
    } finally {
      setUpdating(false);
    }
  }

  const capabilityRows = [
    {
      label: text.installMethod,
      value: getInstallValue(capabilities, hasInstallPrompt, locale),
    },
    {
      label: text.serviceWorker,
      value: getCapabilityValue(capabilities.serviceWorkerSupported, locale),
    },
    {
      label: text.notifications,
      value: getCapabilityValue(capabilities.notificationsSupported, locale),
    },
    {
      label: text.push,
      value: getCapabilityValue(capabilities.pushManagerSupported, locale),
    },
    {
      label: text.badge,
      value: getCapabilityValue(capabilities.badgingSupported, locale),
    },
    {
      label: locale === "th" ? "ความพร้อม Android 14+" : "Android 14+ readiness",
      value: getAndroid14StatusValue(capabilities, locale),
    },
    {
      label: locale === "th" ? "Push บน iOS Home Screen (16.4+)" : "iOS Home Screen Push (16.4+)",
      value: getIosPushStatusValue(capabilities, locale),
    },
  ];

  return (
    <>
      <div className={actionRowClass}>
        {showRuntimeButton ? (
          <button
            type="button"
            onClick={() => setShowRuntimeCard(true)}
            className={runtimeButtonClass + (isSettingsMenu ? "" : getModeTone(capabilities.mode))}
          >
            {isSettingsMenu ? (
              <>
                <span className="inline-flex items-center gap-3">
                  <span className="rounded-xl bg-slate-100 p-2.5 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-700">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-base font-semibold leading-6 text-slate-800">
                      {runtimeModeLabel}
                    </span>
                    <span className="text-xs leading-5 text-slate-500">{text.viewRuntime}</span>
                  </span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className={runtimeStatusBadgeClass}>
                    {hasUpdate ? text.updateReadyLabel : text.liveLabel}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-500" />
                </span>
              </>
            ) : (
              <>
                <Smartphone className="h-3.5 w-3.5" />
                <span>{runtimeModeLabel}</span>
                <span className={runtimeStatusBadgeClass}>
                  {hasUpdate ? text.updateReadyLabel : text.liveLabel}
                </span>
              </>
            )}
          </button>
        ) : null}

        {showInstallButton ? (
          <button
            type="button"
            onClick={function () {
              if (installPrompt) {
                void installPrompt
                  .prompt()
                  .then(function () {
                    if (!installPrompt.userChoice) return;
                    return installPrompt.userChoice.then(function (choice) {
                      if (choice.outcome !== "accepted") {
                        setShowInstallHelpCard(true);
                      }
                    });
                  })
                  .catch(function () {
                    setShowInstallHelpCard(true);
                  });
                return;
              }
              setShowInstallHelpCard(true);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sky-200/70 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-[0_6px_20px_rgba(90,114,168,0.12)] transition hover:bg-sky-50 active:scale-[0.98]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{text.install}</span>
          </button>
        ) : null}

        {showUpdateButton ? (
          <button
            type="button"
            onClick={() => void runUpdate()}
            disabled={updating}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200/70 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-[0_6px_20px_rgba(90,114,168,0.12)] transition hover:bg-violet-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={"h-3.5 w-3.5" + (updating ? " animate-spin" : "")} />
            <span>{updating ? text.updating : text.update}</span>
          </button>
        ) : null}
      </div>

      {showRuntimeCard ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            aria-label={text.close}
            onClick={() => setShowRuntimeCard(false)}
          />
          <div className="relative z-10 w-[min(92vw,460px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{text.runtimeTitle}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{text.runtimeDescription}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRuntimeCard(false)}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={text.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-2 text-[13px] text-slate-700">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span>{text.currentBuild}</span>
                <span className="font-mono text-xs text-slate-900">{shortMarker(versionInfo.marker)}</span>
              </div>

              {hasUpdate ? (
                <div className="flex items-center justify-between rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2">
                  <span>{text.pendingBuild}</span>
                  <span className="font-mono text-xs text-violet-900">{shortMarker(pendingVersionRef.current?.marker)}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span>{text.schema}</span>
                <span className="font-mono text-xs text-slate-900">{versionInfo.schemaVersion ?? RUNTIME_SCHEMA_VERSION}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {capabilityRows.map(function (row) {
                return (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700"
                  >
                    <span>{row.label}</span>
                    <span className="text-right font-medium text-slate-900">{row.value}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-sm font-semibold text-amber-900">{text.updateScope}</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">{text.updateScopeDetail}</p>
            </div>
          </div>
        </div>
      ) : null}

      {showInstallHelpCard ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            aria-label={text.close}
            onClick={() => setShowInstallHelpCard(false)}
          />
          <div className="relative z-10 w-[min(92vw,420px)] rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{installHelp.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{installHelp.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallHelpCard(false)}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={text.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="mt-4 space-y-2 text-[13px] text-slate-700">
              {installHelp.steps.map(function (step) {
                return <li key={step} className="rounded-lg bg-slate-50 px-3 py-2">{step}</li>;
              })}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}

