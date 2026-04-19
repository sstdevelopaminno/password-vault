"use client";

import { useEffect, useMemo, useRef } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import { postRuntimeDiagnostic } from "@/lib/runtime-diagnostics";
import { runVaultRiskEvaluation } from "@/lib/vault-risk-client";
import { useI18n } from "@/i18n/provider";
import { useToast } from "@/components/ui/toast";

const LAST_NOTICE_STORAGE_KEY = "pv_last_risk_notice_id_v1";
const LAST_NOTICE_AT_STORAGE_KEY = "pv_last_risk_notice_at_v1";
const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000;
const RISK_NOTICE_COOLDOWN_MS = 20 * 60 * 1000;

function getRiskMessage(locale: string, severity: "medium" | "high" | "critical") {
  const prefix = locale === "th" ? "แจ้งเตือน Vault Shield:" : "Vault Shield alert:";

  if (severity === "critical") {
    return locale === "th"
      ? `${prefix} พบความเสี่ยงระดับวิกฤต ระบบล็อกข้อมูลชั่วคราวและต้องยืนยันตัวตนใหม่`
      : `${prefix} critical risk detected. Vault is temporarily locked and re-authentication is required.`;
  }
  if (severity === "high") {
    return locale === "th"
      ? `${prefix} พบความเสี่ยงระดับสูง ระบบจำกัดการทำรายการสำคัญชั่วคราว`
      : `${prefix} high risk detected. Sensitive actions are restricted.`;
  }
  return locale === "th"
    ? `${prefix} พบความเสี่ยงระดับกลาง โปรดตรวจสอบสถานะอุปกรณ์`
    : `${prefix} medium risk detected. Please review device security state.`;
}

export function VaultRiskSentinel() {
  const { locale } = useI18n();
  const toast = useToast();
  const inFlightRef = useRef(false);
  const lastNoticeIdRef = useRef("");
  const lastNoticeAtRef = useRef(0);
  const lastRunAtRef = useRef(0);

  const runtime = useMemo(() => detectRuntimeCapabilities(), []);
  const enabled = runtime.isCapacitorNative && runtime.isAndroid;
  const isAuthPath = useMemo(function () {
    if (typeof window === "undefined") return false;
    const pathname = window.location.pathname;
    return (
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/verify-otp")
    );
  }, []);

  useEffect(function () {
    if (typeof window === "undefined") return;
    const rememberedId = window.localStorage.getItem(LAST_NOTICE_STORAGE_KEY) ?? "";
    const rememberedAtRaw = window.localStorage.getItem(LAST_NOTICE_AT_STORAGE_KEY) ?? "0";
    const rememberedAt = Number(rememberedAtRaw);
    lastNoticeIdRef.current = rememberedId;
    lastNoticeAtRef.current = Number.isFinite(rememberedAt) ? rememberedAt : 0;
  }, []);

  useEffect(function () {
    if (!enabled || isAuthPath || typeof window === "undefined") return;

    let disposed = false;
    let intervalId = 0;

    const evaluateRisk = async function (trigger: string) {
      if (disposed) return;
      if (inFlightRef.current) return;
      if (!navigator.onLine) return;

      const now = Date.now();
      if (now - lastRunAtRef.current < 30_000) return;
      lastRunAtRef.current = now;
      inFlightRef.current = true;

      try {
        const result = await runVaultRiskEvaluation(trigger);
        const assessment = result.assessment;
        if (!result.ok || !assessment) return;

        if (assessment.severity === "high" || assessment.severity === "critical") {
          const actionSignature = Array.isArray(assessment.actions) ? assessment.actions.slice().sort().join(",") : "";
          const noticeId = `${assessment.severity}:${actionSignature}`;
          const nowMs = Date.now();
          const withinCooldown = nowMs - lastNoticeAtRef.current < RISK_NOTICE_COOLDOWN_MS;
          if (lastNoticeIdRef.current !== noticeId || !withinCooldown) {
            lastNoticeIdRef.current = noticeId;
            lastNoticeAtRef.current = nowMs;
            window.localStorage.setItem(LAST_NOTICE_STORAGE_KEY, noticeId);
            window.localStorage.setItem(LAST_NOTICE_AT_STORAGE_KEY, String(nowMs));
            toast.showToast(
              getRiskMessage(locale, assessment.severity as "high" | "critical"),
              "error",
            );
          }
        }

        await postRuntimeDiagnostic({
          event: "vault_risk_assessment",
          marker: APP_VERSION,
          note: `severity=${assessment.severity};score=${assessment.score};trigger=${trigger};playIntegrity=${String(result.playIntegrityVerification?.verdict ?? "none")}`,
          capabilities: runtime,
        });
      } catch (error) {
        console.error("Vault risk sentinel failed:", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    void evaluateRisk("boot");

    intervalId = window.setInterval(function () {
      void evaluateRisk("interval");
    }, DEFAULT_SCAN_INTERVAL_MS);

    const onVisibility = function () {
      if (document.visibilityState !== "visible") return;
      void evaluateRisk("visibility");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return function () {
      disposed = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, isAuthPath, locale, runtime, toast]);

  return null;
}
