"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { setOfflineEncryptionPassphrase } from "@/lib/offline-store";
import type { PinAction } from "@/lib/pin";

let pinPreloadIssued = false;

type PinModalProps = {
  action: PinAction;
  actionLabel: string;
  targetItemId?: string;
  onVerified: (assertionToken: string) => void | Promise<void>;
  onPinCaptured?: (pin: string) => void;
  onClose?: () => void;
};

export function PinModal({ action, actionLabel, targetItemId, onVerified, onPinCaptured, onClose }: PinModalProps) {
  const { locale } = useI18n();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);

  const lastAutoSubmittedPinRef = useRef("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pinPreloadIssued) return;
    pinPreloadIssued = true;
    const controller = new AbortController();
    void fetch("/api/pin/verify", {
      method: "POST",
      headers: { "x-pin-preload": "1" },
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const slots = useMemo(() => Array.from({ length: 6 }, (_, i) => pin[i] ?? ""), [pin]);
  const confirmPrefix = locale === "th" ? "ยืนยัน PIN 6 หลักเพื่อ" : "Confirm 6-digit PIN to";
  const pinInputAria = locale === "th" ? "กรอก PIN" : "PIN input";
  const verifyText = locale === "th" ? "ยืนยัน PIN" : "Verify PIN";
  const verifyingText = locale === "th" ? "กำลังยืนยัน..." : "Verifying...";
  const verifyFailed = locale === "th" ? "ยืนยัน PIN ไม่สำเร็จ" : "PIN verification failed";
  const networkFailed = locale === "th" ? "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่" : "Network error. Please try again.";
  const timeoutFailed = locale === "th" ? "หมดเวลาการยืนยัน PIN กรุณาลองใหม่" : "PIN verification timed out. Please retry.";
  const slowProcessing = locale === "th" ? "ระบบกำลังประมวลผล กรุณารอสักครู่..." : "System is processing. Please wait...";
  const closeText = locale === "th" ? "ปิด" : "Close";

  const verify = useCallback(async () => {
    const currentPin = pin.replace(/\D/g, "").slice(0, 6);
    if (inFlightRef.current || currentPin.length !== 6) return;
    inFlightRef.current = true;

    if (mountedRef.current) {
      setLoading(true);
      setError("");
      setShowSlowHint(false);
    }

    const slowHintTimer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setShowSlowHint(true);
    }, 5000);

    const verifyTimeoutMs = process.env.NODE_ENV === "development" ? 0 : 60000;
    const maxAttempts = 2;
    let completed = false;
    let errorShown = false;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        requestAbortRef.current = controller;
        const requestTimeout =
          verifyTimeoutMs > 0
            ? window.setTimeout(() => {
                controller.abort();
              }, verifyTimeoutMs)
            : null;

        try {
          const res = await fetch("/api/pin/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({ pin: currentPin, action, targetItemId }),
          });

          const body = (await res.json().catch(() => ({ error: verifyFailed }))) as {
            error?: string;
            assertionToken?: string;
          };

          if (!res.ok || !body.assertionToken) {
            if (mountedRef.current) {
              setError(body.error ?? verifyFailed);
            }
            errorShown = true;
            completed = true;
            break;
          }

          onPinCaptured?.(currentPin);
          setOfflineEncryptionPassphrase(currentPin);
          if (mountedRef.current) {
            setPin("");
          }
          onClose?.();
          void Promise.resolve(onVerified(body.assertionToken));
          completed = true;
          break;
        } catch (err) {
          const isAbort = (err as Error).name === "AbortError";
          const isNetwork = err instanceof TypeError;
          const canRetry = attempt < maxAttempts && (isAbort || isNetwork);
          if (canRetry) {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
          } else if (isAbort) {
            if (mountedRef.current) {
              setError(timeoutFailed);
            }
            errorShown = true;
            completed = true;
            break;
          } else {
            if (mountedRef.current) {
              setError(networkFailed);
            }
            errorShown = true;
            completed = true;
            break;
          }
        } finally {
          if (requestAbortRef.current === controller) {
            requestAbortRef.current = null;
          }
          if (requestTimeout) {
            window.clearTimeout(requestTimeout);
          }
        }
      }

      if (!completed && !errorShown && mountedRef.current) {
        setError(networkFailed);
      }
    } finally {
      window.clearTimeout(slowHintTimer);
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setShowSlowHint(false);
      }
    }
  }, [action, networkFailed, onClose, onPinCaptured, onVerified, pin, targetItemId, timeoutFailed, verifyFailed]);

  useEffect(() => {
    if (pin.length !== 6 || loading) return;
    if (lastAutoSubmittedPinRef.current === pin) return;
    lastAutoSubmittedPinRef.current = pin;
    void verify();
  }, [pin, loading, verify]);

  useEffect(() => {
    if (pin.length < 6) {
      lastAutoSubmittedPinRef.current = "";
      setShowSlowHint(false);
    }
  }, [pin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]" onClick={loading ? undefined : onClose}>
      <div className="w-full max-w-[480px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <Card className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-app-body font-semibold">
              {confirmPrefix} {actionLabel}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeText}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              disabled={loading}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <input
              ref={inputRef}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
              aria-label={pinInputAria}
            />

            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="grid w-full grid-cols-6 gap-2"
              aria-label={pinInputAria}
            >
              {slots.map((digit, idx) => (
                <span
                  key={idx}
                  className={`flex h-12 items-center justify-center rounded-2xl border text-app-h3 font-semibold ${
                    digit ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {digit ? "*" : "-"}
                </span>
              ))}
            </button>
          </div>

          {error ? <p className="text-app-caption text-rose-600">{error}</p> : null}
          {!error && showSlowHint ? <p className="text-app-caption text-slate-500">{slowProcessing}</p> : null}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {closeText}
            </Button>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-500 text-white" onClick={() => void verify()} disabled={loading || pin.length !== 6}>
              {loading ? verifyingText : verifyText}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
