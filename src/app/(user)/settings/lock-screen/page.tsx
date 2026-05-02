"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Fingerprint, Lock, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import {
  DEFAULT_SCREEN_LOCK_SETTINGS,
  SCREEN_LOCK_SETTINGS_KEY,
  SCREEN_LOCK_SETTINGS_UPDATED_EVENT,
  SCREEN_LOCK_TIMEOUT_OPTIONS_SEC,
  normalizeScreenLockSettings,
  type ScreenLockSettings,
} from "@/lib/screen-lock";
import { readVaultShieldBiometricStatus, type VaultShieldBiometricStatus } from "@/lib/vault-shield";

function formatTimeoutLabel(valueSec: number, locale: "th" | "en") {
  if (valueSec < 60) {
    return locale === "th" ? `${valueSec} วินาที` : `${valueSec}s`;
  }
  const minute = Math.floor(valueSec / 60);
  return locale === "th" ? `${minute} นาที` : `${minute}m`;
}

function readScreenLockSettingsFromStorage(): ScreenLockSettings {
  if (typeof window === "undefined") return DEFAULT_SCREEN_LOCK_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SCREEN_LOCK_SETTINGS_KEY);
    if (!raw) return DEFAULT_SCREEN_LOCK_SETTINGS;
    return normalizeScreenLockSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SCREEN_LOCK_SETTINGS;
  }
}

export default function LockScreenSettingsPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const isThai = locale === "th";

  const [hasPin, setHasPin] = useState(false);
  const [settings, setSettings] = useState<ScreenLockSettings>(() => readScreenLockSettingsFromStorage());
  const [biometricStatus, setBiometricStatus] = useState<VaultShieldBiometricStatus | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const timeoutOptions = useMemo(() => [...SCREEN_LOCK_TIMEOUT_OPTIONS_SEC], []);
  const runtime = useMemo(() => detectRuntimeCapabilities(), []);

  useEffect(() => {
    void fetch("/api/profile/me", { cache: "no-store" })
      .then((res) => res.json().catch(() => ({})))
      .then((body) => setHasPin(Boolean(body?.hasPin)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!runtime.isCapacitorNative || !runtime.isAndroid) {
      setBiometricStatus(null);
      return;
    }

    setBiometricLoading(true);
    void readVaultShieldBiometricStatus()
      .then((result) => {
        if (!mounted) return;
        setBiometricStatus(result);
      })
      .finally(() => {
        if (!mounted) return;
        setBiometricLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [runtime.isAndroid, runtime.isCapacitorNative]);

  const persist = (next: ScreenLockSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(SCREEN_LOCK_SETTINGS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SCREEN_LOCK_SETTINGS_UPDATED_EVENT));
    } catch {
      showToast(isThai ? "บันทึกการตั้งค่าไม่สำเร็จ" : "Unable to save settings.", "error");
    }
  };

  const toggleEnabled = () => {
    if (!hasPin) {
      showToast(isThai ? "กรุณาตั้งค่า PIN ก่อนเปิดล็อคหน้าจอ" : "Please set a PIN before enabling lock screen.", "error");
      return;
    }
    persist({ ...settings, enabled: !settings.enabled });
  };

  const biometricReady = Boolean(
    biometricStatus &&
      biometricStatus.supported &&
      biometricStatus.available &&
      biometricStatus.enrolled,
  );

  const toggleBiometricUnlock = () => {
    if (!hasPin) {
      showToast(isThai ? "กรุณาตั้งค่า PIN ก่อนเปิดใช้งานไบโอเมตริกซ์" : "Please set PIN before enabling biometrics.", "error");
      return;
    }
    if (!biometricReady) {
      showToast(
        isThai
          ? "อุปกรณ์ยังไม่พร้อมใช้ Touch ID / Face ID สำหรับแอปนี้"
          : "Touch ID / Face ID is not ready on this device.",
        "error",
      );
      return;
    }

    const nextMethod = settings.unlockMethod === "biometric_or_pin" ? "pin_only" : "biometric_or_pin";
    persist({ ...settings, unlockMethod: nextMethod });
  };

  return (
    <section className="space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+18px)]">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-app-h2 font-semibold text-slate-100">{isThai ? "ล็อคหน้าจอ" : "Lock screen"}</h1>
      </div>

      <Card className="space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-app-body font-semibold text-slate-100">{isThai ? "เปิดใช้ล็อคหน้าจอด้วย PIN" : "Enable PIN screen lock"}</p>
            <p className="text-app-caption text-slate-300">
              {isThai ? "เมื่อไม่มีการใช้งานตามเวลาที่ตั้ง ระบบจะล็อคหน้าจออัตโนมัติ" : "Auto lock when no activity for the selected timeout."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleEnabled}
            className={"relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition " + (settings.enabled ? "bg-blue-600" : "bg-slate-500")}
            aria-pressed={settings.enabled}
          >
            <span className={"inline-block h-6 w-6 transform rounded-full bg-white transition " + (settings.enabled ? "translate-x-6" : "translate-x-1")} />
          </button>
        </div>
        {!hasPin ? (
          <div className="rounded-xl border border-amber-300/45 bg-amber-500/15 px-3 py-2 text-app-caption text-amber-100">
            {isThai ? "ยังไม่ได้ตั้ง PIN กรุณาไปที่เมนู PIN ความปลอดภัยก่อน" : "PIN is not set. Please configure PIN Security first."}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-app-body font-semibold text-slate-100">
              {isThai ? "ปลดล็อคด้วย Touch ID / Face ID" : "Unlock with Touch ID / Face ID"}
            </p>
            <p className="text-app-caption text-slate-300">
              {isThai
                ? "รองรับ Android 12 ขึ้นไป หากสแกนไม่สำเร็จจะใช้ PIN แทน"
                : "Use device biometrics. Falls back to PIN when biometric authentication fails."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleBiometricUnlock}
            disabled={!hasPin || !biometricReady || biometricLoading}
            className={
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 " +
              (settings.unlockMethod === "biometric_or_pin" ? "bg-blue-600" : "bg-slate-500")
            }
            aria-pressed={settings.unlockMethod === "biometric_or_pin"}
          >
            <span
              className={
                "inline-block h-6 w-6 transform rounded-full bg-white transition " +
                (settings.unlockMethod === "biometric_or_pin" ? "translate-x-6" : "translate-x-1")
              }
            />
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2 text-app-caption text-slate-200">
          <span className="inline-flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-sky-300" />
            {biometricLoading
              ? isThai
                ? "กำลังตรวจสอบสถานะไบโอเมตริกซ์..."
                : "Checking biometric status..."
              : biometricReady
                ? isThai
                  ? "พร้อมใช้งาน (Android 12+)"
                  : "Ready"
                : isThai
                  ? "ยังไม่พร้อมใช้งานบนอุปกรณ์นี้"
                  : "Not available on this device."}
          </span>
        </div>
      </Card>

      <Card className="space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
        <div className="flex items-center gap-2 text-slate-100">
          <TimerReset className="h-4 w-4 text-sky-300" />
          <p className="text-app-body font-semibold">{isThai ? "เวลาล็อคอัตโนมัติ" : "Auto-lock timeout"}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {timeoutOptions.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={settings.timeoutSec === option ? "default" : "secondary"}
              className="h-10"
              onClick={() => persist({ ...settings, timeoutSec: option })}
              disabled={!hasPin}
            >
              {formatTimeoutLabel(option, locale)}
            </Button>
          ))}
        </div>
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2 text-app-caption text-slate-200">
          {isThai
            ? `ค่าปัจจุบัน: ${settings.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"} / ${formatTimeoutLabel(settings.timeoutSec, locale)} / ${settings.unlockMethod === "biometric_or_pin" ? "Biometric + PIN" : "PIN only"}`
            : `Current: ${settings.enabled ? "Enabled" : "Disabled"} / ${formatTimeoutLabel(settings.timeoutSec, locale)} / ${settings.unlockMethod === "biometric_or_pin" ? "Biometric + PIN" : "PIN only"}`}
        </div>
      </Card>

      <Card className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
        <div className="inline-flex items-center gap-2 text-slate-100">
          <Lock className="h-4 w-4 text-sky-300" />
          <p className="text-app-caption">
            {isThai ? "ช่วงเวลาที่รองรับ: 5-30 วินาที และ 1-15 นาที" : "Supported timeouts: 5-30 seconds and 1-15 minutes."}
          </p>
        </div>
      </Card>
    </section>
  );
}


