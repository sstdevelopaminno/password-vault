"use client";

import { useEffect, useMemo, useRef } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import { postRuntimeDiagnostic } from "@/lib/runtime-diagnostics";
import { runVaultRiskEvaluation } from "@/lib/vault-risk-client";
import { useI18n } from "@/i18n/provider";
import { useToast } from "@/components/ui/toast";

const LAST_NOTICE_STORAGE_KEY = "pv_last_risk_notice_id_v1";
const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000;

function getRiskMessage(locale: string, severity: "medium" | "high" | "critical") {
  const prefix = locale === "th" ? "Vault Shield Alert:" : "Vault Shield Alert:";

  if (severity === "critical") {
    return `${prefix} critical risk detected. Vault is temporarily locked and re-authentication is required.`;
  }
  if (severity === "high") {
    return `${prefix} high risk detected. Sensitive actions are restricted and re-authentication is required.`;
  }
  return `${prefix} medium risk detected. Step-up authentication is required for sensitive operations.`;
}

export function VaultRiskSentinel() {
  const { locale } = useI18n();
  const toast = useToast();
  const inFlightRef = useRef(false);
  const lastNoticeIdRef = useRef("");
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
    lastNoticeIdRef.current = rememberedId;
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

        if (["medium", "high", "critical"].includes(assessment.severity)) {
          const noticeId = `${assessment.assessedAt}:${assessment.severity}:${assessment.score}`;
          if (lastNoticeIdRef.current !== noticeId) {
            lastNoticeIdRef.current = noticeId;
            window.localStorage.setItem(LAST_NOTICE_STORAGE_KEY, noticeId);
            toast.showToast(
              getRiskMessage(locale, assessment.severity as "medium" | "high" | "critical"),
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
