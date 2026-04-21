"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

const POLL_MS = 5000;
const ACCESS_CHECK_ART_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/578899.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzU3ODg5OS5wbmciLCJpYXQiOjE3NzY0MTk5NjYsImV4cCI6MTgwNzk1NTk2Nn0.aE8IrA57M7-6CAyrX2XHTtJZwUFi0GV9dCnriyLPhw4";
const MAX_UNAUTHORIZED_RETRIES = 12;

type GateMode = "loading" | "otp" | "pending" | "active" | "error";

type ProfilePayload = {
  email?: string;
  needsOtpVerification?: boolean;
  pendingApproval?: boolean;
  userId?: string;
  error?: string;
  recoverable?: boolean;
};

type VerifyOtpPayload = {
  error?: string;
  pendingApproval?: boolean;
};

type ResendOtpPayload = {
  error?: string;
  retryAfterSec?: number;
};

function parseRetrySeconds(message: string) {
  const matched = String(message).match(/after\s+(\d+)\s*seconds?/i);
  if (!matched) return 0;
  const seconds = Number(matched[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function mapGateError(message: unknown, locale: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("unauthorized") || lower.includes("session expired")) {
    return locale === "th" ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "Session expired. Please sign in again.";
  }
  if (lower.includes("session synchronization") || lower.includes("sync")) {
    return locale === "th" ? "กำลังซิงก์เซสชันความปลอดภัย กรุณารอสักครู่" : "Session synchronization in progress. Please wait.";
  }

  if (lower.includes("token")) {
    return locale === "th" ? "OTP ไม่ถูกต้องหรือหมดอายุ" : "Invalid or expired OTP";
  }
  if (lower.includes("rate")) {
    return locale === "th" ? "ขอ OTP บ่อยเกินไป กรุณารอสักครู่" : "OTP rate limited. Please wait.";
  }
  if (text) {
    return text;
  }
  return locale === "th" ? "ดำเนินการไม่สำเร็จ กรุณาลองใหม่" : "Request failed. Please retry.";
}

export function UserAccessGate(props: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const { locale } = useI18n();
  const isThai = locale === "th";

  const [mode, setMode] = useState<GateMode>("loading");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [lastAutoOtp, setLastAutoOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const unauthorizedRef = useRef(0);
  const modeRef = useRef<GateMode>(mode);
  const loadProfileRef = useRef<(showErrorToast: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const loadProfile = useCallback(
    async (showErrorToast: boolean) => {
      try {
        const res = await fetch("/api/profile/me", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ProfilePayload;
        const errorText = String(body.error ?? "").toLowerCase();
        const recoverableError =
          Boolean(body.recoverable) || errorText.includes("session synchronization") || errorText.includes("sync");

        if (res.status === 401) {
          const online = typeof navigator === "undefined" ? true : navigator.onLine;
          if (!online || recoverableError) {
            window.setTimeout(() => {
              void loadProfileRef.current(false);
            }, 1500);
            return;
          }

          unauthorizedRef.current += 1;
          if (unauthorizedRef.current >= MAX_UNAUTHORIZED_RETRIES) {
            router.replace("/login");
            return;
          }
          window.setTimeout(() => {
            void loadProfileRef.current(false);
          }, Math.min(12_000, 1200 * unauthorizedRef.current));
          return;
        }

        if (res.status === 503 || res.status === 504 || recoverableError) {
          if (showErrorToast) {
            showToast(
              isThai
                ? "กำลังซิงก์เซสชันความปลอดภัย กรุณารอสักครู่"
                : "Session synchronization in progress. Please wait.",
              "error",
            );
          }
          window.setTimeout(() => {
            void loadProfileRef.current(false);
          }, 1500);
          return;
        }

        unauthorizedRef.current = 0;

        if (!res.ok) {
          if (showErrorToast) {
            showToast(mapGateError(body.error, locale), "error");
          }
          setMode("error");
          return;
        }

        setEmail(String(body.email ?? ""));
        if (Boolean(body.needsOtpVerification)) {
          setMode("otp");
          return;
        }

        if (Boolean(body.pendingApproval)) {
          setMode("pending");
          return;
        }

        if (modeRef.current !== "active") {
          showToast(isThai ? "เข้าสู่ระบบเรียบร้อย" : "Signed in successfully", "success");
        }
        setMode("active");
      } catch {
        if (showErrorToast) {
          showToast(isThai ? "เครือข่ายไม่เสถียร กำลังลองใหม่..." : "Network unstable. Retrying...", "error");
        }
        window.setTimeout(() => {
          void loadProfileRef.current(false);
        }, 1200);
      }
    },
    [isThai, locale, router, showToast],
  );

  useEffect(() => {
    loadProfileRef.current = loadProfile;
  }, [loadProfile]);

  const verifyOtpNow = useCallback(async () => {
    if (loading || otp.length !== 6) return;

    setLoading(true);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, purpose: "signup" }),
    });

    const body = (await res.json().catch(() => ({}))) as VerifyOtpPayload;
    setLoading(false);

    if (!res.ok) {
      showToast(mapGateError(body.error, locale), "error");
      return;
    }

    setOtp("");
    setLastAutoOtp("");

    if (Boolean(body.pendingApproval)) {
      showToast(
        isThai ? "ยืนยัน OTP สำเร็จ ระบบกำลังตรวจสอบสิทธิ์บัญชี" : "OTP verified. System is checking account access.",
        "success",
      );
      setMode("pending");
      return;
    }

    showToast(isThai ? "ยืนยัน OTP สำเร็จ เข้าสู่ระบบเรียบร้อย" : "OTP verified. Signed in successfully", "success");
    setMode("active");
    void loadProfile(false);
  }, [email, isThai, loading, locale, otp, showToast, loadProfile]);

  const resendOtpNow = useCallback(async () => {
    if (resendLoading || resendIn !== 0) return;

    setResendLoading(true);
    const res = await fetch("/api/auth/resend-signup-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const body = (await res.json().catch(() => ({}))) as ResendOtpPayload;
    setResendLoading(false);

    if (!res.ok) {
      const retry = parseRetrySeconds(String(body.error ?? ""));
      if (retry !== 0) setResendIn(retry);
      showToast(mapGateError(body.error, locale), "error");
      return;
    }

    const retryAfter = Number(body.retryAfterSec ?? 60);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      setResendIn(retryAfter);
    }
    showToast(isThai ? "ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบอีเมล" : "OTP resent. Please check your inbox.", "success");
  }, [email, isThai, locale, resendIn, resendLoading, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile(false);
  }, [loadProfile, pathname]);

  useEffect(() => {
    if (resendIn === 0) return;
    const timer = window.setInterval(() => {
      setResendIn((value) => (value === 0 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (mode !== "pending") return;
    const timer = window.setInterval(() => {
      void loadProfile(false);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadProfile, mode]);

  useEffect(() => {
    if (mode !== "otp" || loading) return;
    if (otp.length !== 6) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (lastAutoOtp !== "") setLastAutoOtp("");
      return;
    }
    if (otp === lastAutoOtp) return;
    setLastAutoOtp(otp);
    void verifyOtpNow();
  }, [lastAutoOtp, loading, mode, otp, verifyOtpNow]);

  if (mode === "active") {
    return <>{props.children}</>;
  }

  const resendDisabled = resendLoading || resendIn !== 0;
  const title =
    mode === "otp"
      ? isThai
        ? "ยืนยัน OTP ก่อนเข้าใช้งาน"
        : "Verify OTP before access"
      : mode === "pending"
        ? isThai
          ? "กำลังตรวจสอบสิทธิ์บัญชี"
          : "Checking account access"
        : isThai
          ? "กำลังตรวจสอบสิทธิ์"
          : "Checking access";

  const subtitle =
    mode === "otp"
      ? isThai
        ? "กรอกรหัส OTP 6 หลักจากอีเมลที่สมัคร"
        : "Enter your 6-digit OTP from email"
      : mode === "pending"
        ? isThai
          ? "ระบบกำลังตรวจสอบข้อมูลการยืนยันตัวตน กรุณารอสักครู่"
          : "The system is checking identity verification details. Please wait."
        : isThai
          ? "กรุณารอสักครู่"
          : "Please wait";

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/35 p-4 backdrop-blur-[1.5px]">
      <div className="mx-auto mt-16 w-full max-w-[520px]">
        <Card className="space-y-4 rounded-[24px] border border-white/70 bg-white/78 p-5 shadow-[0_20px_48px_rgba(15,23,42,0.24)] backdrop-blur-md">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

          {mode === "otp" ? (
            <div className="space-y-3">
              <Input value={email} readOnly className="bg-slate-50 text-slate-600" />
              <OtpInput value={otp} onChange={setOtp} length={6} ariaLabel={isThai ? "กรอก OTP" : "OTP input"} />

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => router.replace("/login")}>
                  {isThai ? "ออกจากระบบ" : "Sign out"}
                </Button>
                <Button onClick={() => void verifyOtpNow()} disabled={loading}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      {isThai ? "กำลังยืนยัน..." : "Verifying..."}
                    </span>
                  ) : isThai ? (
                    "ยืนยัน OTP"
                  ) : (
                    "Verify OTP"
                  )}
                </Button>
              </div>

              <Button variant="secondary" className="w-full" onClick={() => void resendOtpNow()} disabled={resendDisabled}>
                {resendLoading
                  ? isThai
                    ? "กำลังส่ง OTP..."
                    : "Sending OTP..."
                  : resendIn !== 0
                    ? isThai
                      ? `ส่งใหม่ใน ${resendIn} วินาที`
                      : `Resend in ${resendIn}s`
                    : isThai
                      ? "ส่ง OTP ใหม่"
                      : "Resend OTP"}
              </Button>
            </div>
          ) : mode === "pending" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-800">{subtitle}</div>
              <button
                type="button"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() => void loadProfile(true)}
              >
                {isThai ? "ตรวจสอบอีกครั้ง" : "Check again"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="h-[150px] w-full rounded-2xl bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${ACCESS_CHECK_ART_URL})` }}
                aria-hidden
              />
              <div className="flex items-center justify-center py-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 shadow-sm backdrop-blur">
                  <Spinner className="h-4 w-4 border-slate-300 border-t-slate-600" />
                  {isThai ? "กำลังตรวจสอบสิทธิ์..." : "Checking access..."}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
