"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PinModal } from "@/components/vault/pin-modal";
import { useI18n } from "@/i18n/provider";
import {
  DEFAULT_SCREEN_LOCK_SETTINGS,
  SCREEN_LOCK_SETTINGS_KEY,
  SCREEN_LOCK_SETTINGS_UPDATED_EVENT,
  normalizeScreenLockSettings,
  type ScreenLockSettings,
} from "@/lib/screen-lock";
import { authenticateVaultShieldBiometric } from "@/lib/vault-shield";

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
  const [showPinModal, setShowPinModal] = useState(false);
  const timerRef = useRef<number | null>(null);
  const biometricInFlightRef = useRef(false);

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
      setShowPinModal(false);
      if (locked) {
        const unlockId = window.setTimeout(() => {
          setLocked(false);
        }, 0);
        return () => window.clearTimeout(unlockId);
      }
      return;
    }
    scheduleLock();
    return () => clearTimer();
  }, [clearTimer, hasPin, locked, scheduleLock, settings.enabled]);

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

  useEffect(() => {
    if (!locked || !hasPin) return;

    if (settings.unlockMethod !== "biometric_or_pin") {
      setShowPinModal(true);
      return;
    }

    if (biometricInFlightRef.current) return;
    biometricInFlightRef.current = true;
    setShowPinModal(false);

    const title = isThai ? "ยืนยันตัวตนเพื่อปลดล็อค" : "Verify to unlock";
    const subtitle = isThai ? "ใช้สแกนนิ้วหรือใบหน้า" : "Use fingerprint or face";
    const negative = isThai ? "ใช้ PIN แทน" : "Use PIN";

    void authenticateVaultShieldBiometric({
      title,
      subtitle,
      negativeButtonText: negative,
    })
      .then((result) => {
        if (result?.success) {
          setLocked(false);
          setShowPinModal(false);
          scheduleLock();
          return;
        }
        setShowPinModal(true);
      })
      .catch(() => {
        setShowPinModal(true);
      })
      .finally(() => {
        biometricInFlightRef.current = false;
      });
  }, [hasPin, isThai, locked, scheduleLock, settings.unlockMethod]);

  return (
    <>
      {children}

      {locked && showPinModal ? (
        <PinModal
          action="unlock_app"
          actionLabel={isThai ? "ปลดล็อคหน้าจอ" : "Unlock screen"}
          onClose={() => undefined}
          onVerified={() => {
            setLocked(false);
            setShowPinModal(false);
            scheduleLock();
          }}
        />
      ) : null}
    </>
  );
}
