"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PinModal } from "@/components/vault/pin-modal";
import {
  DEFAULT_SCREEN_LOCK_SETTINGS,
  SCREEN_LOCK_SETTINGS_KEY,
  SCREEN_LOCK_SETTINGS_UPDATED_EVENT,
  normalizeScreenLockSettings,
  type ScreenLockSettings,
} from "@/lib/screen-lock";
import { useI18n } from "@/i18n/provider";

type ScreenLockGuardProps = {
  children: ReactNode;
  hasPin: boolean;
};

function readSettings(): ScreenLockSettings {
  if (typeof window === "undefined") return DEFAULT_SCREEN_LOCK_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SCREEN_LOCK_SETTINGS_KEY);
    if (!raw) return DEFAULT_SCREEN_LOCK_SETTINGS;
    return normalizeScreenLockSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SCREEN_LOCK_SETTINGS;
  }
}

export function ScreenLockGuard({ children, hasPin }: ScreenLockGuardProps) {
  const { locale } = useI18n();
  const isThai = locale === "th";

  const [settings, setSettings] = useState<ScreenLockSettings>(() => readSettings());
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleLock = useCallback(() => {
    clearTimer();
    if (!hasPin || !settings.enabled || locked) return;
    timerRef.current = window.setTimeout(() => {
      setLocked(true);
    }, settings.timeoutSec * 1000);
  }, [clearTimer, hasPin, locked, settings.enabled, settings.timeoutSec]);

  const markActivity = useCallback(() => {
    if (locked) return;
    scheduleLock();
  }, [locked, scheduleLock]);

  useEffect(() => {
    setSettings(readSettings());
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SCREEN_LOCK_SETTINGS_KEY) {
        setSettings(readSettings());
      }
    };
    const onSettingsUpdated = () => {
      setSettings(readSettings());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SCREEN_LOCK_SETTINGS_UPDATED_EVENT, onSettingsUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SCREEN_LOCK_SETTINGS_UPDATED_EVENT, onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!hasPin || !settings.enabled) {
      clearTimer();
      setLocked(false);
      return;
    }
    scheduleLock();
    return () => clearTimer();
  }, [clearTimer, hasPin, scheduleLock, settings.enabled]);

  useEffect(() => {
    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    const onActivity = () => markActivity();
    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [markActivity]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markActivity();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markActivity]);

  return (
    <>
      {children}

      {locked ? (
        <PinModal
          action="unlock_app"
          actionLabel={isThai ? "ปลดล็อคหน้าจอ" : "Unlock screen"}
          onClose={() => undefined}
          onVerified={() => {
            setLocked(false);
            scheduleLock();
          }}
        />
      ) : null}
    </>
  );
}
