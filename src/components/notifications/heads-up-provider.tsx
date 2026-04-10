"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChevronDown, ChevronUp, ShieldAlert, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";

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
  requestBrowserPermission: () => Promise<NotificationPermission | "unsupported">;
};

const SETTINGS_STORAGE_KEY = "pv_notification_settings_v1";
const VERSION_SEEN_KEY = "pv_seen_app_version";
const AUTO_PERMISSION_PROMPT_KEY = "pv_auto_permission_prompted_v1";
const APP_NAME = "Password Vault";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

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
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: input.message,
    icon: "/icons/icon-192.svg",
    badge: settings.badge ? "/icons/icon-192.svg" : undefined,
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
  const [settings, setSettings] = useState<NotificationSettings>(getInitialSettings);
  const settingsRef = useRef(settings);
  const pushEndpointRef = useRef("");

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
    const message =
      locale === "th"
        ? `ระบบอัปเดตเป็นเวอร์ชัน ${APP_VERSION} แล้ว`
        : `System updated to version ${APP_VERSION}.`;
    const detail =
      locale === "th"
        ? "แนะนำให้รีเฟรชหนึ่งครั้งเพื่อใช้งานฟีเจอร์ล่าสุดให้ครบ"
        : "Refresh app once to use all latest features.";
    notify({
      kind: "system",
      title: locale === "th" ? "อัปเดตระบบใหม่" : "New system update",
      message,
      details: detail,
      href: "/home",
      alsoSystem: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setBrowserPermission("unsupported");
      return "unsupported" as const;
    }
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
    return result;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") return;
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
  }, []);

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
      const ttl = input.persistent ? 12_000 : 7_000;
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
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: Record<string, unknown> };
      if (!data || data.type !== "PUSH_RECEIVED") return;

      const payload = data.payload ?? {};
      const title = String(payload.title ?? "Password Vault");
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

  const value = useMemo<HeadsUpContextValue>(
    () => ({
      notify,
      settings,
      updateSettings,
      browserPermission,
      requestBrowserPermission,
    }),
    [notify, settings, updateSettings, browserPermission, requestBrowserPermission],
  );

  return (
    <HeadsUpContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-2 z-[90] mx-auto flex w-full max-w-[500px] flex-col gap-2 px-3">
        {items.map((item) => {
          const opened = Boolean(expanded[item.id]);
          const itemTime = new Date(item.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <article
              key={item.id}
              className="pointer-events-auto animate-heads-up-in overflow-hidden rounded-2xl border border-white/45 bg-white/92 p-3 shadow-[0_16px_34px_rgba(15,23,42,0.22)] backdrop-blur"
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
                  <img
                    src={item.thumbnailUrl}
                    alt=""
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




