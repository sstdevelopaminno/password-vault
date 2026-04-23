"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

function parseRetrySeconds(message: string) {
  const matched = String(message).match(/after\s+(\d+)\s*seconds?/i);
  if (!matched) return 0;
  const seconds = Number(matched[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function mapVerifyError(message: unknown, locale: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("token") || lower.includes("invalid otp")) {
    return locale === "th" ? "OTP ไม่ถูกต้องหรือหมดอายุ" : "Invalid or expired OTP";
  }
  if (lower.includes("rate")) {
    return locale === "th" ? "OTP ถูกจำกัดความถี่ กรุณารอสักครู่" : "OTP rate limited. Please wait.";
  }
  if (text) {
    return text;
  }
  return locale === "th" ? "ยืนยัน OTP ไม่สำเร็จ" : "OTP verification failed";
}

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { t, locale } = useI18n();
  const isThai = locale === "th";

  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const autoSubmittedOtpRef = useRef("");

  useEffect(() => {
    if (resendIn === 0) return;
    const timer = window.setInterval(() => {
      setResendIn((value) => (value <= 0 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const submitOtp = useCallback(
    async (event?: Pick<FormEvent<HTMLFormElement>, "preventDefault">) => {
      event?.preventDefault();
      if (loading || otp.length !== 6) return;

      setLoading(true);
      try {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp, email, purpose: "signup" }),
        });

        if (res.ok) {
          autoSubmittedOtpRef.current = "";
          showToast(
            isThai ? "ยืนยัน OTP สำเร็จ เข้าสู่ระบบเรียบร้อยแล้ว" : "OTP verified. Signed in successfully.",
            "success",
          );
          router.push("/home");
          return;
        }

        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(mapVerifyError(body.error, locale), "error");
      } finally {
        setLoading(false);
      }
    },
    [email, isThai, loading, locale, otp, router, showToast],
  );

  const resendOtp = useCallback(async () => {
    if (resendLoading || resendIn !== 0) return;

    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfterSec?: number };

      if (!res.ok) {
        const retry = parseRetrySeconds(String(body.error ?? ""));
        if (retry > 0) setResendIn(retry);
        showToast(mapVerifyError(body.error, locale), "error");
        return;
      }

      const retryAfter = Number(body.retryAfterSec ?? 60);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setResendIn(retryAfter);
      }

      showToast(isThai ? "ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบอีเมล" : "OTP resent. Please check your inbox.", "success");
    } finally {
      setResendLoading(false);
    }
  }, [email, isThai, locale, resendIn, resendLoading, showToast]);

  useEffect(() => {
    if (loading) return;
    if (otp.length !== 6) {
      autoSubmittedOtpRef.current = "";
      return;
    }
    if (otp === autoSubmittedOtpRef.current) return;
    autoSubmittedOtpRef.current = otp;
    void submitOtp();
  }, [loading, otp, submitOtp]);

  return (
    <MobileShell>
      <main className="flex flex-1 items-center px-5 py-8">
        <Card className="w-full space-y-4 animate-slide-up">
          <h1 className="text-xl font-semibold">{t("verifyOtp.title")}</h1>

          <form className="space-y-4" onSubmit={submitOtp}>
            <Input
              type="email"
              placeholder={t("verifyOtp.email")}
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />

            <OtpInput value={otp} onChange={setOtp} length={6} ariaLabel={t("otpInput.ariaLabel")} />

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => void resendOtp()}
                disabled={resendLoading || resendIn !== 0}
              >
                {resendLoading
                  ? isThai
                    ? "กำลังส่ง OTP..."
                    : "Sending OTP..."
                  : resendIn !== 0
                    ? isThai
                      ? `ขอใหม่ใน ${resendIn} วินาที`
                      : `Resend in ${resendIn}s`
                    : isThai
                      ? "ส่ง OTP ใหม่"
                      : "Resend OTP"}
              </Button>

              <Button className="w-full" disabled={loading || otp.length !== 6}>
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    {t("verifyOtp.verifying")}
                  </span>
                ) : (
                  t("verifyOtp.verify")
                )}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </MobileShell>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <MobileShell>
          <main className="flex flex-1 items-center px-5 py-8">
            <Card className="w-full space-y-4 animate-slide-up">
              <h1 className="text-xl font-semibold">Verify OTP</h1>
              <div className="flex items-center justify-center py-4">
                <Spinner />
              </div>
            </Card>
          </main>
        </MobileShell>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
