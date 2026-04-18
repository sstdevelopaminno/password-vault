"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChevronDown, ChevronUp, ShieldAlert, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import {
  UPDATE_DETAILS_PATH,
  getReleaseUpdateDetail,
  getReleaseUpdateMessage,
  getReleaseUpdateTitle,
} from "@/lib/release-update";

type NotificationKind = "system" | "security" | "auth" | "vault" | "general";

type HeadsUpNotificationInput = {
  kind: NotificationKind;
  title: string;
  message: string;
  href?: string;
  details?: string;
  thumbnailUrl?: string;
  persistent?: boolean;
  alsoSystem?: boolean;
  suppressSystem?: boolean;
};

type HeadsUpNotificationItem = HeadsUpNotificationInput & {
  id: string;
  createdAt: number;
};

export type NotificationSettings = {
  enabled: boolean;
  popup: boolean;
  sound: boolean;
  vibrate: boolean;
  lockScreen: boolean;
  tray: boolean;
  badge: boolean;
  allowSystem: boolean;
  allowSecurity: boolean;
  allowAuth: boolean;
  allowVault: boolean;
};

type HeadsUpContextValue = {
  notify: (input: HeadsUpNotificationInput) => void;
  settings: NotificationSettings;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  browserPermission: NotificationPermission | "unsupported";
  permissionSource: "browser" | "native";
  requestBrowserPermission: () => Promise<NotificationPermission | "unsupported">;
  openSystemNotificationSettings: () => Promise<boolean>;
};

const SETTINGS_STORAGE_KEY = "pv_notification_settings_v1";
const VERSION_SEEN_KEY = "pv_seen_app_version";
const AUTO_PERMISSION_PROMPT_KEY = "pv_auto_permission_prompted_v1";
const APP_NAME = "Vault";
const APP_ICON = "/icons/icon-192.png";
const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
const SWIPE_DISMISS_DISTANCE = 72;
const SWIPE_MAX_OFFSET = 180;

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  popup: true,
  sound: true,
  vibrate: true,
  lockScreen: true,
  tray: true,
  badge: true,
  allowSystem: true,
  allowSecurity: true,
  allowAuth: true,
  allowVault: true,
};

const HeadsUpContext = createContext<HeadsUpContextValue | null>(null);

function mapPermissionStateToNotificationPermission(state: string): NotificationPermission | "unsupported" {
  const normalized = String(state ?? "").toLowerCase();
  if (normalized === "granted") return "granted";
  if (normalized === "denied") return "denied";
  if (normalized === "prompt" || normalized === "prompt-with-rationale") return "default";
  return "unsupported";
}

function isCapacitorNativeRuntime() {
  if (typeof window === "undefined") return false;
  const capabilities = detectRuntimeCapabilities();
  return capabilities.isCapacitorNative;
}

async function checkNativeNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  try {
    const plugin = await import("@capacitor/local-notifications");
    const result = await plugin.LocalNotifications.checkPermissions();
    return mapPermissionStateToNotificationPermission(result.display);
  } catch {
    return "unsupported";
  }
}

async function requestNativeNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  try {
    const plugin = await import("@capacitor/local-notifications");
    const result = await plugin.LocalNotifications.requestPermissions();
    return mapPermissionStateToNotificationPermission(result.display);
  } catch {
    return "unsupported";
  }
}

function getInitialPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

function getInitialSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function canDisplayKind(kind: NotificationKind, settings: NotificationSettings) {
  if (!settings.enabled) return false;
  if (kind === "system") return settings.allowSystem;
  if (kind === "security") return settings.allowSecurity;
  if (kind === "auth") return settings.allowAuth;
  if (kind === "vault") return settings.allowVault;
  return true;
}

function normalizeKind(value: unknown): NotificationKind {
  const raw = String(value ?? "general").toLowerCase();
  if (raw === "system" || raw === "security" || raw === "auth" || raw === "vault") {
    return raw;
  }
  return "general";
}

function base64UrlToUint8Array(base64UrlString: string) {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function tone() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.value = 0.045;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    window.setTimeout(() => {
      oscillator.stop();
      void ctx.close();
    }, 120);
  } catch {
    // ignore
  }
}

async function showSystemNotification(input: HeadsUpNotificationInput, settings: NotificationSettings) {
  if (typeof window === "undefined") return;
  if (isCapacitorNativeRuntime()) {
    try {
      const plugin = await import("@capacitor/local-notifications");
      const permission = await plugin.LocalNotifications.checkPermissions();
      const mapped = mapPermissionStateToNotificationPermission(permission.display);
      if (mapped !== "granted") return;
      const id = Math.floor(Date.now() % 2_000_000_000);
      await plugin.LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: `${APP_NAME} - ${input.title}`,
            body: input.message,
            smallIcon: "ic_launcher",
            largeIcon: APP_ICON,
            actionTypeId: "OPEN_APP",
            extra: {
              href: input.href ?? "/home",
              kind: input.kind,
            },
          },
        ],
      });
      return;
    } catch {
      // ignore
    }
  }
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: input.message,
    icon: "/icons/icon-192.png",
    badge: settings.badge ? "/icons/icon-192.png" : undefined,
    data: { href: input.href ?? "/home" },
    tag: `pv-${input.kind}-${Date.now()}`,
    requireInteraction: Boolean(input.persistent || input.kind === "security"),
    silent: !settings.sound,
  };

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(`${APP_NAME} - ${input.title}`, options);
      return;
    }
    // fallback
    const notification = new Notification(`${APP_NAME} - ${input.title}`, options);
    notification.onclick = () => {
      window.focus();
      if (input.href) window.location.assign(input.href);
      notification.close();
    };
  } catch {
    // ignore
  }
}

export function HeadsUpNotificationProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const [items, setItems] = useState<HeadsUpNotificationItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">(getInitialPermission);
  const [permissionSource, setPermissionSource] = useState<"browser" | "native">("browser");
  const [settings, setSettings] = useState<NotificationSettings>(getInitialSettings);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const pushEndpointRef = useRef("");
  const swallowClickRef = useRef<{ id: string; until: number } | null>(null);
  const swipeRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    deltaX: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previous = window.localStorage.getItem(VERSION_SEEN_KEY);
    if (!previous) {
      window.localStorage.setItem(VERSION_SEEN_KEY, APP_VERSION);
      return;
    }
    if (previous === APP_VERSION) return;

    window.localStorage.setItem(VERSION_SEEN_KEY, APP_VERSION);
    const message = getReleaseUpdateMessage(locale);
    const detail = getReleaseUpdateDetail(locale);
    notify({
      kind: "system",
      title: getReleaseUpdateTitle(locale),
      message,
      details: detail,
      href: UPDATE_DETAILS_PATH,
      alsoSystem: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const resolvePermissionState = useCallback(async () => {
    if (typeof window === "undefined") {
      setPermissionSource("browser");
      setBrowserPermission("unsupported");
      return "unsupported" as const;
    }
    if (isCapacitorNativeRuntime()) {
      setPermissionSource("native");
      const nativePermission = await checkNativeNotificationPermission();
      setBrowserPermission(nativePermission);
      return nativePermission;
    }
    setPermissionSource("browser");
    if (typeof Notification === "undefined") {
      setBrowserPermission("unsupported");
      return "unsupported" as const;
    }
    const value = Notification.permission;
    setBrowserPermission(value);
    return value;
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined") {
      setPermissionSource("browser");
      setBrowserPermission("unsupported");
      return "unsupported" as const;
    }
    if (isCapacitorNativeRuntime()) {
      setPermissionSource("native");
      const nativeResult = await requestNativeNotificationPermission();
      setBrowserPermission(nativeResult);
      return nativeResult;
    }
    setPermissionSource("browser");
    if (typeof Notification === "undefined") {
      setBrowserPermission("unsupported");
      return "unsupported" as const;
    }
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
    return result;
  }, []);

  const openSystemNotificationSettings = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if (!isCapacitorNativeRuntime()) return false;

    try {
      const permission = await requestNativeNotificationPermission();
      setBrowserPermission(permission);
      return permission === "granted";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void resolvePermissionState();
    if (typeof window === "undefined") return;
    const refresh = () => {
      void resolvePermissionState();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [resolvePermissionState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (browserPermission !== "default") return;
    if (!settings.enabled || !settings.tray) return;
    const prompted = window.localStorage.getItem(AUTO_PERMISSION_PROMPT_KEY);
    if (prompted === "1") return;
    window.localStorage.setItem(AUTO_PERMISSION_PROMPT_KEY, "1");
    const timer = window.setTimeout(() => {
      void requestBrowserPermission();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [browserPermission, requestBrowserPermission, settings.enabled, settings.tray]);

  const syncPushSubscription = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isCapacitorNativeRuntime()) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!VAPID_PUBLIC_KEY) return;
    if (browserPermission !== "granted") return;

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const serialized = subscription.toJSON();
      const endpoint = serialized.endpoint ?? subscription.endpoint ?? "";
      const p256dh = serialized.keys?.p256dh ?? "";
      const auth = serialized.keys?.auth ?? "";
      if (!endpoint || !p256dh || !auth) return;
      if (pushEndpointRef.current === endpoint) return;

      const response = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          keys: { p256dh, auth },
        }),
      });

      if (response.ok) {
        pushEndpointRef.current = endpoint;
      }
    } catch {
      // ignore
    }
  }, [browserPermission]);

  const removePushSubscription = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isCapacitorNativeRuntime()) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? pushEndpointRef.current;

      if (endpoint) {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }

      if (subscription) {
        await subscription.unsubscribe();
      }
      pushEndpointRef.current = "";
    } catch {
      // ignore
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setExpanded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSwipeOffsets((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const beginSwipe = useCallback((id: string, pointerId: number, clientX: number, clientY: number) => {
    swipeRef.current = {
      id,
      pointerId,
      startX: clientX,
      startY: clientY,
      deltaX: 0,
      dragging: false,
    };
    setSwipingId(id);
  }, []);

  const moveSwipe = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const current = swipeRef.current;
    if (!current || current.pointerId !== pointerId) return false;

    const dx = clientX - current.startX;
    const dy = clientY - current.startY;

    if (!current.dragging) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return false;
      current.dragging = true;
    }

    const nextOffset = Math.max(-SWIPE_MAX_OFFSET, Math.min(SWIPE_MAX_OFFSET, dx));
    current.deltaX = nextOffset;
    setSwipeOffsets((prev) => {
      if (prev[current.id] === nextOffset) return prev;
      return { ...prev, [current.id]: nextOffset };
    });
    return true;
  }, []);

  const endSwipe = useCallback((pointerId: number, cancelled = false) => {
    const current = swipeRef.current;
    if (!current || current.pointerId !== pointerId) return;

    swipeRef.current = null;
    const id = current.id;
    const offset = cancelled ? 0 : current.deltaX;
    const dismiss = !cancelled && Math.abs(offset) >= SWIPE_DISMISS_DISTANCE;

    if (current.dragging) {
      swallowClickRef.current = { id, until: Date.now() + 260 };
    }

    if (dismiss) {
      setSwipeOffsets((prev) => ({ ...prev, [id]: Math.sign(offset) * (SWIPE_MAX_OFFSET + 72) }));
      window.setTimeout(() => removeItem(id), 110);
    } else {
      setSwipeOffsets((prev) => ({ ...prev, [id]: 0 }));
      window.setTimeout(() => {
        setSwipeOffsets((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 220);
    }

    setSwipingId(null);
  }, [removeItem]);

  const notify = useCallback((input: HeadsUpNotificationInput) => {
    const snapshot = settingsRef.current;
    if (!canDisplayKind(input.kind, snapshot)) return;

    const id = crypto.randomUUID();
    const nextItem: HeadsUpNotificationItem = {
      ...input,
      id,
      createdAt: Date.now(),
    };

    if (snapshot.popup) {
      setItems((prev) => [nextItem, ...prev].slice(0, 4));
      const ttl = input.persistent ? 6_500 : 3_200;
      window.setTimeout(() => removeItem(id), ttl);
    }

    if (snapshot.sound) {
      tone();
    }

    if (snapshot.vibrate && "vibrate" in navigator) {
      navigator.vibrate(input.kind === "security" ? [120, 90, 120, 90, 120] : [80]);
    }

    const shouldSystemNotify = !input.suppressSystem && Boolean(input.alsoSystem || document.hidden || snapshot.tray || snapshot.lockScreen);
    if (shouldSystemNotify) {
      void showSystemNotification(input, snapshot);
    }

    if (snapshot.badge && "setAppBadge" in navigator) {
      const setBadge = Reflect.get(navigator, "setAppBadge");
      if (typeof setBadge === "function") {
        void setBadge.call(navigator, 1);
      }
    }
  }, [removeItem]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!("clearAppBadge" in navigator)) return;
      const clearBadge = Reflect.get(navigator, "clearAppBadge");
      if (typeof clearBadge === "function") {
        void clearBadge.call(navigator);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isCapacitorNativeRuntime()) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const enabledForPush = settings.enabled && settings.tray;
    if (enabledForPush && browserPermission === "granted") {
      void syncPushSubscription();
      return;
    }

    if (!enabledForPush || browserPermission === "denied") {
      void removePushSubscription();
    }
  }, [browserPermission, removePushSubscription, settings.enabled, settings.tray, syncPushSubscription]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isCapacitorNativeRuntime()) return;
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: Record<string, unknown> };
      if (!data || data.type !== "PUSH_RECEIVED") return;

      const payload = data.payload ?? {};
      const title = String(payload.title ?? "Vault");
      const message = String(payload.body ?? payload.message ?? "");
      if (!message) return;

      notify({
        kind: normalizeKind(payload.kind ?? payload.notification_kind),
        title,
        message,
        href: typeof payload.href === "string" ? payload.href : "/home",
        details: typeof payload.details === "string" ? payload.details : undefined,
        thumbnailUrl: typeof payload.image === "string" ? payload.image : undefined,
        persistent: Boolean(payload.requireInteraction),
        suppressSystem: true,
      });
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [notify]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCapacitorNativeRuntime()) return;

    let cancelled = false;
    let removeListener: (() => Promise<void> | void) | null = null;

    void (async function attachListener() {
      try {
        const plugin = await import("@capacitor/local-notifications");
        const handle = await plugin.LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
          if (cancelled) return;
          const href = String(event.notification.extra?.href ?? "/home");
          window.location.assign(href);
        });
        removeListener = () => handle.remove();
      } catch {
        // ignore listener setup failures
      }
    })();

    return () => {
      cancelled = true;
      if (removeListener) {
        void removeListener();
      }
    };
  }, []);

  const value = useMemo<HeadsUpContextValue>(
    () => ({
      notify,
      settings,
      updateSettings,
      browserPermission,
      permissionSource,
      requestBrowserPermission,
      openSystemNotificationSettings,
    }),
    [notify, settings, updateSettings, browserPermission, permissionSource, requestBrowserPermission, openSystemNotificationSettings],
  );

  return (
    <HeadsUpContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),8px)] z-[90] mx-auto flex w-full max-w-[460px] flex-col gap-2 px-3">
        {items.map((item) => {
          const opened = Boolean(expanded[item.id]);
          const itemTime = new Date(item.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const offset = swipeOffsets[item.id] ?? 0;
          const dragging = swipingId === item.id;
          const opacity = 1 - Math.min(Math.abs(offset) / 260, 0.45);

          return (
            <article
              key={item.id}
              className="pointer-events-auto animate-heads-up-in overflow-hidden rounded-2xl border border-sky-100/80 bg-white/95 p-3 shadow-[0_18px_38px_rgba(15,23,42,0.2)] ring-1 ring-white/70 backdrop-blur will-change-transform"
              style={{
                transform: `translateX(${offset}px)`,
                opacity,
                transition: dragging ? "none" : "transform 200ms ease, opacity 200ms ease",
                touchAction: "pan-y",
              }}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" && event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                beginSwipe(item.id, event.pointerId, event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                const handled = moveSwipe(event.pointerId, event.clientX, event.clientY);
                if (handled) {
                  event.preventDefault();
                }
              }}
              onPointerUp={(event) => {
                endSwipe(event.pointerId);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                endSwipe(event.pointerId, true);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onClickCapture={(event) => {
                const gate = swallowClickRef.current;
                if (gate && gate.id === item.id && Date.now() < gate.until) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => {
                    if (item.href) {
                      window.location.assign(item.href);
                    }
                  }}
                >
                  <span className="rounded-full bg-blue-100 p-1.5 text-blue-700">
                    {item.kind === "security" ? <ShieldAlert className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-600">{APP_NAME}</span>
                    <span className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title}</span>
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-500">{itemTime}</span>
                  <button type="button" onClick={() => removeItem(item.id)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-5 text-slate-700 ${opened ? "" : "line-clamp-2"}`}>{item.message}</p>
                  {opened && item.details ? <p className="mt-1 text-xs leading-5 text-slate-500">{item.details}</p> : null}
                </div>
                {item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    sizes="56px"
                    unoptimized
                    className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                ) : null}
              </div>

              <div className="mt-2 flex items-center justify-between">
                {item.details ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [item.id]: !opened }))}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600"
                  >
                    {opened ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {opened ? (locale === "th" ? "ย่อรายละเอียด" : "Collapse") : (locale === "th" ? "ขยายรายละเอียด" : "Expand")}
                  </button>
                ) : (
                  <span />
                )}

                {item.href ? (
                  <button
                    type="button"
                    onClick={() => window.location.assign(item.href!)}
                    className="text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4"
                  >
                    {locale === "th" ? "ดูต่อ" : "Open"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </HeadsUpContext.Provider>
  );
}

export function useHeadsUpNotifications() {
  const ctx = useContext(HeadsUpContext);
  if (!ctx) {
    throw new Error("useHeadsUpNotifications must be used inside HeadsUpNotificationProvider");
  }
  return ctx;
}




