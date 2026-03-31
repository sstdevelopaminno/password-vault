"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

function parseRetrySeconds(message: string) {
  const m = message.match(/after\s+(\d+)\s*seconds?/i);
  if (!m) return 0;
  const sec = Number(m[1]);
  return Number.isFinite(sec) ? sec : 0;
}

function isOtpRateLimited(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("request this after") ||
    lower.includes("security purposes") ||
    lower.includes("too many requests") ||
    lower.includes("over_email_send_rate_limit")
  );
}

function mapRegisterError(message: unknown, locale: "th" | "en", fallback: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("invalid signup payload")) {
    return locale === "th" ? "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" : "Invalid signup payload";
  }
  if (lower.includes("email already registered")) {
    return locale === "th" ? "อีเมลนี้ถูกใช้งานแล้ว" : "Email already registered";
  }
  if (lower.includes("token") || lower.includes("invalid otp")) {
    return locale === "th" ? "OTP ไม่ถูกต้องหรือหมดอายุ" : "Invalid or expired OTP";
  }
  if (isOtpRateLimited(text)) {
    return locale === "th" ? "ขอ OTP บ่อยเกินไป กรุณารอสักครู่" : "OTP rate limited. Please wait.";
  }
  if (lower.includes("unable to send otp right now")) {
    return locale === "th" ? "ยังไม่สามารถส่ง OTP ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" : "Unable to send OTP right now. Please try again shortly.";
  }
  if (lower.includes("otp delivery service unavailable")) {
    return locale === "th" ? "ระบบส่ง OTP ยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง" : "OTP delivery service unavailable. Please try again shortly.";
  }

  return text || fallback;
}

function mapRegisterSuccess(message: unknown, locale: "th" | "en", fallback: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("otp sent")) {
    return locale === "th" ? "ส่ง OTP ไปที่อีเมลแล้ว" : "OTP sent to your email";
  }
  if (lower.includes("waiting for admin approval")) {
    return locale === "th" ? "สมัครสำเร็จแล้ว กรุณารอผู้ดูแลอนุมัติ" : "Signup complete. Waiting for admin approval.";
  }

  return text || fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { t, locale } = useI18n();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function requestOtp() {
    if (loading || resendIn > 0) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);
    const body = await res.json().catch(
      () => ({} as { error?: string; otpRequired?: boolean; message?: string; retryAfterSec?: number }),
    );

    if (!res.ok) {
      const rawError = String(body.error ?? "");
      const apiRetry = Number(body.retryAfterSec ?? 0);
      const parsedRetry = parseRetrySeconds(rawError);
      const rateLimited = res.status === 429 || isOtpRateLimited(rawError);
      const waitSec = apiRetry > 0 ? apiRetry : parsedRetry > 0 ? parsedRetry : 60;

      const message = rateLimited
        ? locale === "th"
          ? `ขอ OTP บ่อยเกินไป กรุณารอ ${waitSec} วินาที`
          : `OTP rate limited. Please wait ${waitSec}s.`
        : mapRegisterError(body.error, locale, t("register.failedSendOtp"));

      setError(message);
      showToast(message, "error");

      if (rateLimited) {
        setResendIn(waitSec);
      }
      return;
    }

    if (body.otpRequired !== false) {
      setOtpSent(true);
    }
    setOtp("");
    const nextRetry = Number(body.retryAfterSec ?? 60);
    setResendIn(Number.isFinite(nextRetry) && nextRetry > 0 ? nextRetry : 60);
    showToast(mapRegisterSuccess(body.message, locale, t("register.otpSent")), "success");
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, otp }),
    });

    setLoading(false);
    const body = await res.json().catch(() => ({} as { error?: string; message?: string }));

    if (!res.ok) {
      const message = mapRegisterError(body.error, locale, t("register.failedRegister"));
      setError(message);
      showToast(message, "error");
      return;
    }

    showToast(mapRegisterSuccess(body.message, locale, t("register.createdPending")), "success");
    router.push("/login");
  }

  return (
    <MobileShell>
      <main className="flex flex-1 items-center px-5 py-8">
        <Card className="w-full space-y-4 animate-slide-up">
          <h1 className="text-xl font-semibold">{t("register.title")}</h1>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (otpSent) {
                void createAccount(e);
              } else {
                void requestOtp();
              }
            }}
          >
            {!otpSent ? (
              <>
                <Input
                  placeholder={t("register.fullName")}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
                <Input
                  type="email"
                  placeholder={t("register.email")}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  placeholder={t("register.password")}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  placeholder={t("register.confirmPassword")}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  required
                />
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3">
                <p className="text-sm text-slate-600">
                  {locale === "th"
                    ? t("register.createdPending")
                    : t("register.createdPending")}
                </p>
                <OtpInput value={otp} onChange={setOtp} length={6} ariaLabel={t("otpInput.ariaLabel")} />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                      setError("");
                    }}
                  >
                    {locale === "th" ? "แก้ไขข้อมูล" : "Edit info"}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading || resendIn > 0}
                    onClick={() => void requestOtp()}
                  >
                    {resendIn > 0
                      ? locale === "th"
                        ? `ขอใหม่ใน ${resendIn}s`
                        : `Resend in ${resendIn}s`
                      : t("register.sendOtp")}
                  </Button>
                </div>
              </div>
            )}

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <Button className="w-full" disabled={loading || (!otpSent && resendIn > 0) || (otpSent && otp.length !== 6)}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {otpSent ? t("register.creating") : t("register.sendingOtp")}
                </span>
              ) : otpSent ? (
                t("register.createAccount")
              ) : (
                t("register.sendOtp")
              )}
            </Button>
          </form>
        </Card>
      </main>
    </MobileShell>
  );
}

