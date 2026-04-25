"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { ScreenLockGuard } from "@/components/auth/screen-lock-guard";

const POLL_MS = 5000;
const MAX_UNAUTHORIZED_RETRIES = 12;
const ACCESS_GATE_ICON_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/44589.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzQ0NTg5LnBuZyIsImlhdCI6MTc3NzA4NDE5NCwiZXhwIjoxODA4NjIwMTk0fQ.yFiVeiHAK7xhqDTYL9J5louRDezNAMep2IzLNcCBRKw";

type GateMode = "loading" | "otp" | "pending" | "pin_setup" | "active" | "error";

type ProfilePayload = {
  email?: string;
  hasPin?: boolean;
  needsOtpVerification?: boolean;
  pendingApproval?: boolean;
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
  if (text) return text;
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
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [hasPin, setHasPin] = useState(false);

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
            window.setTimeout(() => void loadProfileRef.current(false), 1500);
            return;
          }

          unauthorizedRef.current += 1;
          if (unauthorizedRef.current >= MAX_UNAUTHORIZED_RETRIES) {
            router.replace("/login");
            return;
          }

          window.setTimeout(() => void loadProfileRef.current(false), Math.min(12_000, 1200 * unauthorizedRef.current));
          return;
        }

        if (res.status === 503 || res.status === 504 || recoverableError) {
          if (showErrorToast) {
            showToast(
              isThai ? "กำลังซิงก์เซสชันความปลอดภัย กรุณารอสักครู่" : "Session synchronization in progress. Please wait.",
              "error",
            );
          }
          window.setTimeout(() => void loadProfileRef.current(false), 1500);
          return;
        }

        unauthorizedRef.current = 0;
        if (!res.ok) {
          if (showErrorToast) showToast(mapGateError(body.error, locale), "error");
          setMode("error");
          return;
        }

        setEmail(String(body.email ?? ""));
        setHasPin(Boolean(body.hasPin));
        if (Boolean(body.needsOtpVerification)) {
          setMode("otp");
          return;
        }
        if (Boolean(body.pendingApproval)) {
          setMode("pending");
          return;
        }
        if (!Boolean(body.hasPin)) {
          setMode("pin_setup");
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
        window.setTimeout(() => void loadProfileRef.current(false), 1200);
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
    if (Number.isFinite(retryAfter) && retryAfter > 0) setResendIn(retryAfter);
    showToast(isThai ? "ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบอีเมล" : "OTP resent. Please check your inbox.", "success");
  }, [email, isThai, locale, resendIn, resendLoading, showToast]);

  const setupPinNow = useCallback(async () => {
    if (pinSaving) return;
    const nextPin = pinNew.replace(/\D/g, "").slice(0, 6);
    const confirmPin = pinConfirm.replace(/\D/g, "").slice(0, 6);

    if (nextPin.length !== 6 || confirmPin.length !== 6) {
      showToast(isThai ? "กรุณากรอก PIN 6 หลักให้ครบ" : "Please enter a 6-digit PIN.", "error");
      return;
    }
    if (nextPin !== confirmPin) {
      showToast(isThai ? "PIN และยืนยัน PIN ไม่ตรงกัน" : "PIN confirmation does not match.", "error");
      return;
    }

    setPinSaving(true);
    try {
      const res = await fetch("/api/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin: nextPin, confirmPin }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(mapGateError(body.error, locale), "error");
        return;
      }

      setPinNew("");
      setPinConfirm("");
      showToast(isThai ? "ตั้งค่า PIN สำเร็จ" : "PIN setup completed.", "success");
      await loadProfile(false);
    } finally {
      setPinSaving(false);
    }
  }, [isThai, loadProfile, locale, pinConfirm, pinNew, pinSaving, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProfile(true), 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    void loadProfile(false);
  }, [loadProfile, pathname]);

  useEffect(() => {
    if (resendIn === 0) return;
    const timer = window.setInterval(() => setResendIn((value) => (value === 0 ? 0 : value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (mode !== "pending") return;
    const timer = window.setInterval(() => void loadProfile(false), POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadProfile, mode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (mode !== "active") {
      body.classList.add("gate-overlay-open");
    } else {
      body.classList.remove("gate-overlay-open");
    }
    return () => {
      body.classList.remove("gate-overlay-open");
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "otp" || loading) return;
    if (otp.length !== 6) {
      if (lastAutoOtp !== "") setLastAutoOtp("");
      return;
    }
    if (otp === lastAutoOtp) return;
    setLastAutoOtp(otp);
    void verifyOtpNow();
  }, [lastAutoOtp, loading, mode, otp, verifyOtpNow]);

  if (mode === "active") {
    return <ScreenLockGuard hasPin={hasPin}>{props.children}</ScreenLockGuard>;
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
        : mode === "pin_setup"
          ? isThai
            ? "ตั้งค่า PIN ความปลอดภัย"
            : "Set your security PIN"
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
        : mode === "pin_setup"
          ? isThai
            ? "เพื่อความปลอดภัย กรุณาตั้ง PIN 6 หลักก่อนเข้าใช้งานระบบ"
            : "For security, please set a 6-digit PIN before using the app."
          : isThai
            ? "กรุณารอสักครู่"
            : "Please wait";

  if (mode === "loading" || mode === "pending") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-transparent p-4">
        <div className="animate-modal-pop-in">
          <Image
            src={ACCESS_GATE_ICON_URL}
            alt="Access check image"
            width={1280}
            height={720}
            className="h-auto w-[min(58vw,300px)] object-contain"
            priority
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[rgba(2,7,25,0.24)] p-4 backdrop-blur-[0.5px]">
      <div className="mx-auto mt-8 w-full max-w-[520px]">
        <Card className="relative space-y-4 rounded-[30px] border border-[rgba(123,144,217,0.32)] bg-[linear-gradient(180deg,rgba(8,16,40,0.94),rgba(5,11,30,0.98))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[rgba(128,178,255,0.46)] bg-[rgba(20,36,84,0.92)] shadow-[0_0_18px_rgba(70,166,255,0.32)]">
            <Image src={ACCESS_GATE_ICON_URL} alt="Access icon" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
          </div>
          <h2 className={'relative text-xl font-semibold ' + (mode === "otp" ? "text-[#f6fbff]" : "neon-title")}>{title}</h2>
          <p className="relative text-sm leading-6 text-[#99aed7]">{subtitle}</p>

          {mode === "otp" ? (
            <div className="space-y-3">
              <Input value={email} readOnly className="bg-[rgba(10,18,42,0.72)] text-[#dfecff]" />
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
          ) : mode === "pin_setup" ? (
            <div className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinNew}
                onChange={(event) => setPinNew(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={isThai ? "PIN ใหม่ 6 หลัก" : "New 6-digit PIN"}
                className="bg-[rgba(10,18,42,0.72)] text-[#dfecff]"
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinConfirm}
                onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={isThai ? "ยืนยัน PIN 6 หลัก" : "Confirm 6-digit PIN"}
                className="bg-[rgba(10,18,42,0.72)] text-[#dfecff]"
              />
              <Button onClick={() => void setupPinNow()} disabled={pinSaving} className="h-11 w-full">
                {pinSaving ? (isThai ? "กำลังบันทึก..." : "Saving...") : (isThai ? "บันทึก PIN" : "Save PIN")}
              </Button>
              <Button variant="secondary" onClick={() => router.replace("/login")} disabled={pinSaving}>
                {isThai ? "ออกจากระบบ" : "Sign out"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-2 text-sm text-[#9eb2da]">
              <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(124,145,220,0.4)] bg-[rgba(10,18,42,0.82)] px-4 py-2 shadow-sm backdrop-blur">
                <Spinner className="h-4 w-4 border-[rgba(137,154,217,0.45)] border-t-[#36d7ff]" />
                {isThai ? "กำลังตรวจสอบสิทธิ์..." : "Checking access..."}
              </span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
