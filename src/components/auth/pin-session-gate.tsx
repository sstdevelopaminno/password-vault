"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { clampPinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC } from "@/lib/pin-session";

const STORAGE_PREFIX = "pv_pin_unlock_";

function storageKey(userId: string) {
  return STORAGE_PREFIX + (userId || "anonymous");
}

type PinSessionGateProps = {
  children?: React.ReactNode;
  hasPin: boolean;
  pinSessionEnabled: boolean;
  pinSessionTimeoutSec: number;
  userId: string;
};

function formatTimeoutText(locale: "th" | "en", timeoutSec: number) {
  if (timeoutSec < 60) {
    return locale === "th"
      ? `ล็อกอัตโนมัติเมื่อไม่มีการใช้งาน ${timeoutSec} วินาที`
      : `Locks automatically after ${timeoutSec}s of inactivity.`;
  }
  const mins = Math.floor(timeoutSec / 60);
  return locale === "th"
    ? `ล็อกอัตโนมัติเมื่อไม่มีการใช้งาน ${mins} นาที`
    : `Locks automatically after ${mins} min of inactivity.`;
}

export function PinSessionGate({ children, hasPin, pinSessionEnabled, pinSessionTimeoutSec, userId }: PinSessionGateProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const autoSubmitRef = useRef("");
  const inactivityTimerRef = useRef<number | null>(null);

  const key = storageKey(userId);
  const isSettingsPage = pathname.startsWith("/settings");
  const safeTimeoutSec = clampPinSessionTimeoutSec(pinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC);
  const inactivityLockMs = safeTimeoutSec * 1000;

  const lockNow = useCallback(() => {
    if (!hasPin || !pinSessionEnabled) return;
    setLocked(true);
    setPin("");
    setError("");
    autoSubmitRef.current = "";
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(key);
    }
  }, [hasPin, key, pinSessionEnabled]);

  const markUnlocked = useCallback(() => {
    setLocked(false);
    setPin("");
    setError("");
    autoSubmitRef.current = "";
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(key, "1");
    }
  }, [key]);

  const armInactivityLock = useCallback(() => {
    if (inactivityTimerRef.current !== null) {
      window.clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = window.setTimeout(() => {
      armInactivityLock();
    }, inactivityLockMs);
  }, [inactivityLockMs, lockNow]);

  useEffect(() => {
    if (!hasPin || !pinSessionEnabled) {
      setLocked(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(key);
      }
      return;
    }
    if (typeof window === "undefined") {
      setLocked(true);
      return;
    }
    const cached = window.sessionStorage.getItem(key);
    setLocked(cached !== "1");
  }, [hasPin, key, pinSessionEnabled]);

  useEffect(() => {
    if (!hasPin || !pinSessionEnabled || locked) {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    armInactivityLock();

    const onActivity = () => armInactivityLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        armInactivityLock();
      } else {
        armInactivityLock();
      }
    };

    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("pointermove", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("pointermove", onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [armInactivityLock, hasPin, lockNow, locked, pinSessionEnabled]);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => pinInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [locked]);

  const verifyPinNow = useCallback(async () => {
    if (loading || pin.length !== 6) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ pin, action: "unlock_app" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; assertionToken?: string };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !body.assertionToken) {
        const fallback = locale === "th" ? "PIN ไม่ถูกต้อง" : "Invalid PIN";
        setError(String(body.error ?? fallback));
        return;
      }

      markUnlocked();
    } catch {
      setError(locale === "th" ? "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่" : "Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [loading, locale, markUnlocked, pin, router]);

  useEffect(() => {
    if (pin.length !== 6 || loading) return;
    if (autoSubmitRef.current === pin) return;
    autoSubmitRef.current = pin;
    void verifyPinNow();
  }, [loading, pin, verifyPinNow]);

  useEffect(() => {
    if (pin.length < 6) {
      autoSubmitRef.current = "";
    }
  }, [pin]);

  const pinSlots = useMemo(() => Array.from({ length: 6 }, (_, idx) => pin[idx] ?? ""), [pin]);

  if (!hasPin && pinSessionEnabled && !isSettingsPage) {
    return (
      <div className="relative">
        {children}
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[520px]">
            <Card className="space-y-4 rounded-[24px] border border-[var(--border-strong)] bg-white p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {locale === "th" ? "ตั้งค่า PIN ก่อนใช้งาน" : "Set PIN before access"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {locale === "th"
                      ? "เพื่อความปลอดภัย กรุณาตั้งค่า PIN 6 หลักที่หน้า Settings"
                      : "For security, please set a 6-digit PIN in Settings first."}
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={() => router.push("/settings")}>
                {locale === "th" ? "ไปที่ตั้งค่า PIN" : "Go to PIN Settings"}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!locked || !hasPin || !pinSessionEnabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {children}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
        <div className="w-full max-w-[520px] animate-slide-up">
          <Card className="space-y-4 rounded-[24px] border border-[var(--border-strong)] bg-white p-5">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-900">
                {locale === "th" ? "ยืนยัน PIN เพื่อปลดล็อก" : "Enter PIN to unlock"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {formatTimeoutText(locale, safeTimeoutSec)}
              </p>
            </div>

            <div className="relative">
              <input
                ref={pinInputRef}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                value={pin}
                onChange={(ev) => setPin(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                className="absolute inset-0 h-full w-full opacity-0"
                aria-label={locale === "th" ? "กรอก PIN" : "PIN input"}
              />
              <button type="button" onClick={() => pinInputRef.current?.focus()} className="grid w-full grid-cols-6 gap-2">
                {pinSlots.map((digit, idx) => (
                  <span
                    key={idx}
                    className={
                      "flex h-12 items-center justify-center rounded-2xl border text-xl font-semibold " +
                      (digit ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-400")
                    }
                  >
                    {digit ? "•" : "-"}
                  </span>
                ))}
              </button>
            </div>

            {error ? <p className="text-xs text-rose-600">{error}</p> : null}

            <Button
              className="w-full bg-gradient-to-r from-[var(--logo-cyan)] via-[var(--logo-blue)] to-[var(--logo-magenta)] text-white"
              disabled={loading || pin.length !== 6}
              onClick={() => void verifyPinNow()}
            >
              {loading
                ? locale === "th"
                  ? "กำลังยืนยัน..."
                  : "Verifying..."
                : locale === "th"
                  ? "ปลดล็อก"
                  : "Unlock"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
