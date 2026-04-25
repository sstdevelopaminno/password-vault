"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMS_ACK_STORAGE_KEY = "pv_terms_ack_v1";
const TERMS_ACK_VERSION = "2026-04-18";

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value);
}

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
    return locale === "th" ? "ยังไม่สามารถส่ง OTP ได้ในขณะนี้ กรุณาลองใหม่" : "Unable to send OTP right now. Please try again.";
  }
  if (lower.includes("otp delivery service unavailable")) {
    return locale === "th" ? "ระบบส่ง OTP ยังไม่พร้อมใช้งาน กรุณาลองใหม่" : "OTP delivery service unavailable. Please try again.";
  }

  return text || fallback;
}

function mapRegisterSuccess(message: unknown, locale: "th" | "en", fallback: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("otp sent")) {
    return locale === "th" ? "ส่ง OTP ไปที่อีเมลแล้ว" : "OTP sent to your email";
  }
  if (lower.includes("account is now active")) {
    return locale === "th" ? "ยืนยัน OTP สำเร็จ บัญชีพร้อมใช้งานแล้ว" : "OTP verified. Account is active.";
  }

  return text || fallback;
}

function hasAcceptedTerms() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TERMS_ACK_STORAGE_KEY) === TERMS_ACK_VERSION;
}

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { t, locale } = useI18n();
  const isThai = locale === "th";

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
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementSubmitting, setAgreementSubmitting] = useState(false);

  const [emailChecking, setEmailChecking] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [emailInlineError, setEmailInlineError] = useState("");

  const normalizedEmail = useMemo(() => form.email.trim().toLowerCase(), [form.email]);
  const fullNameFilled = form.fullName.trim().length > 0;
  const hasPassword = form.password.length > 0;
  const hasConfirmPassword = form.confirmPassword.length > 0;
  const allRequiredFilled = fullNameFilled && normalizedEmail.length > 0 && hasPassword && hasConfirmPassword;
  const emailFormatValid = isValidEmail(normalizedEmail);
  const passwordMismatch = hasConfirmPassword && form.password !== form.confirmPassword;

  const canRequestOtp =
    !otpSent &&
    !loading &&
    resendIn <= 0 &&
    allRequiredFilled &&
    emailFormatValid &&
    !passwordMismatch &&
    !emailChecking &&
    !emailExists;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (otpSent) return;
    if (!normalizedEmail || !emailFormatValid) {
      setEmailChecking(false);
      setEmailExists(false);
      setEmailInlineError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEmailChecking(true);
      try {
        const response = await fetch("/api/auth/check-register-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail }),
          signal: controller.signal,
        });

        const body = await response.json().catch(() => ({} as { exists?: boolean }));
        const exists = Boolean(body.exists);
        setEmailExists(exists);
        setEmailInlineError(
          exists
            ? isThai
              ? "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น"
              : "This email is already registered. Please use another email."
            : "",
        );
      } catch (fetchError) {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setEmailExists(false);
          setEmailInlineError("");
        }
      } finally {
        if (!controller.signal.aborted) {
          setEmailChecking(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [emailFormatValid, isThai, normalizedEmail, otpSent]);

  function validateBeforeOtp() {
    if (!allRequiredFilled) {
      return isThai ? "กรุณากรอกข้อมูลให้ครบก่อนขอ OTP" : "Please fill in all fields before requesting OTP.";
    }
    if (!emailFormatValid) {
      return isThai ? "รูปแบบอีเมลไม่ถูกต้อง" : "Invalid email format.";
    }
    if (form.password.length < 8) {
      return isThai ? "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร" : "Password must be at least 8 characters.";
    }
    if (passwordMismatch) {
      return isThai ? "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน" : "Passwords do not match.";
    }
    if (emailExists) {
      return isThai ? "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น" : "This email is already registered. Please use another email.";
    }
    if (emailChecking) {
      return isThai ? "กำลังตรวจสอบอีเมล กรุณารอสักครู่" : "Checking email. Please wait.";
    }
    return "";
  }

  async function requestOtp() {
    if (!canRequestOtp) return;

    const validationError = validateBeforeOtp();
    if (validationError) {
      setError(validationError);
      showToast(validationError, "error");
      return;
    }

    setLoading(true);
    setError("");

    const payload = {
      ...form,
      fullName: form.fullName.trim(),
      email: normalizedEmail,
    };

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        ? isThai
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

  async function resendOtp() {
    if (loading || resendIn > 0) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/resend-signup-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    setLoading(false);
    const body = await res.json().catch(
      () => ({} as { error?: string; message?: string; retryAfterSec?: number }),
    );

    if (!res.ok) {
      const rawError = String(body.error ?? "");
      const apiRetry = Number(body.retryAfterSec ?? 0);
      const parsedRetry = parseRetrySeconds(rawError);
      const rateLimited = res.status === 429 || isOtpRateLimited(rawError);
      const waitSec = apiRetry > 0 ? apiRetry : parsedRetry > 0 ? parsedRetry : 60;

      const message = rateLimited
        ? isThai
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

    const nextRetry = Number(body.retryAfterSec ?? 60);
    setResendIn(Number.isFinite(nextRetry) && nextRetry > 0 ? nextRetry : 60);
    showToast(mapRegisterSuccess(body.message, locale, t("register.otpSent")), "success");
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    const payload = {
      ...form,
      fullName: form.fullName.trim(),
      email: normalizedEmail,
      otp,
    };

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);
    const body = await res.json().catch(() => ({} as { error?: string; message?: string }));

    if (!res.ok) {
      const message = mapRegisterError(body.error, locale, t("register.failedRegister"));
      setError(message);
      showToast(message, "error");
      return;
    }

    showToast(
      mapRegisterSuccess(body.message, locale, isThai ? "สมัครสำเร็จ บัญชีพร้อมใช้งานแล้ว" : "Registration complete. Account is active."),
      "success",
    );

    if (hasAcceptedTerms()) {
      router.replace("/home");
      return;
    }

    setAgreementOpen(true);
  }

  async function acceptAgreement() {
    if (agreementSubmitting) return;
    setAgreementSubmitting(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TERMS_ACK_STORAGE_KEY, TERMS_ACK_VERSION);
      }

      await fetch("/api/profile/me", { cache: "no-store" }).catch(() => null);
      setAgreementOpen(false);
      router.replace("/home");
    } finally {
      setAgreementSubmitting(false);
    }
  }

  return (
    <MobileShell>
      <main className="flex flex-1 items-center px-5 py-8">
        <Card className="w-full space-y-4 animate-slide-up">
          <h1 className="text-xl font-semibold">{t("register.title")}</h1>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (otpSent) {
                void createAccount(event);
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
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      fullName: event.target.value,
                    }))
                  }
                  required
                />
                <div className="space-y-1.5">
                  <Input
                    type="email"
                    placeholder={t("register.email")}
                    value={form.email}
                    onChange={(event) => {
                      const nextEmail = event.target.value;
                      setForm((prev) => ({
                        ...prev,
                        email: nextEmail,
                      }));
                      setEmailExists(false);
                      setEmailInlineError("");
                    }}
                    className={emailInlineError ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""}
                    required
                  />
                  {emailChecking && normalizedEmail && emailFormatValid ? (
                    <p className="text-xs text-slate-500">
                      {isThai ? "กำลังตรวจสอบอีเมล..." : "Checking email..."}
                    </p>
                  ) : null}
                  {emailInlineError ? <p className="text-sm text-rose-600">{emailInlineError}</p> : null}
                </div>
                <Input
                  type="password"
                  placeholder={t("register.password")}
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <div className="space-y-1.5">
                  <Input
                    type="password"
                    placeholder={t("register.confirmPassword")}
                    value={form.confirmPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    className={passwordMismatch ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""}
                    required
                  />
                  {passwordMismatch ? (
                    <p className="text-sm text-rose-600">
                      {isThai ? "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน" : "Passwords do not match."}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3">
                <p className="text-sm text-slate-600">
                  {isThai ? "กรุณากรอก OTP 6 หลักจากอีเมลเพื่อยืนยันการสมัคร" : "Please enter the 6-digit OTP from your email."}
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
                    {isThai ? "แก้ไขข้อมูล" : "Edit info"}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading || resendIn > 0}
                    onClick={() => void resendOtp()}
                  >
                    {resendIn > 0
                      ? isThai
                        ? `ขอใหม่ใน ${resendIn}s`
                        : `Resend in ${resendIn}s`
                      : t("register.sendOtp")}
                  </Button>
                </div>
              </div>
            )}

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <Button
              className="w-full"
              disabled={otpSent ? loading || otp.length !== 6 : !canRequestOtp}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {otpSent ? t("register.creating") : t("register.sendingOtp")}
                </span>
              ) : otpSent ? (
                isThai ? "ยืนยัน OTP และเข้าใช้งาน" : "Verify OTP and continue"
              ) : (
                t("register.sendOtp")
              )}
            </Button>
          </form>
        </Card>
      </main>

      {agreementOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.25),transparent_48%),rgba(2,6,23,0.62)] p-4 backdrop-blur-md">
          <Card className="w-full max-w-[620px] space-y-4 rounded-[28px] border border-[rgba(148,163,184,0.28)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-[0_20px_80px_rgba(15,23,42,0.28)] sm:p-6">
            <div className="rounded-2xl border border-[rgba(14,116,144,0.2)] bg-[linear-gradient(135deg,rgba(6,182,212,0.1),rgba(59,130,246,0.08))] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                {isThai ? "ก่อนเริ่มใช้งาน" : "Before You Start"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {isThai ? "ยืนยันข้อตกลงการใช้งาน" : "Confirm Terms of Use"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {isThai
                  ? "อ่านและยอมรับข้อตกลงด้านความปลอดภัยเพื่อเริ่มใช้งานบัญชีใหม่ของคุณ"
                  : "Please review and accept the security terms to activate your new account."}
              </p>
            </div>

            <h3 className="text-base font-semibold text-slate-900">
              {isThai ? "ข้อตกลงการใช้งานระบบ" : "Terms of Use"}
            </h3>

            <div className="space-y-2 rounded-2xl border border-slate-200/90 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-4 text-sm leading-6 text-slate-700">
              <p>
                {isThai
                  ? "1) ระบบมีฟังก์ชันหลักด้านความปลอดภัย เช่น OTP, PIN และการเข้ารหัสข้อมูล"
                  : "1) The app includes core security features such as OTP, PIN, and data encryption."}
              </p>
              <p>
                {isThai
                  ? "2) ทีมงานให้การดูแลและแก้ไขปัญหาระบบตลอด 24/7 เพื่อให้ผู้ใช้ใช้งานได้อย่างต่อเนื่อง"
                  : "2) Our team provides 24/7 support and incident response to keep the service available."}
              </p>
              <p>
                {isThai
                  ? "3) ผู้ใช้ต้องรักษาความลับของบัญชี รหัสผ่าน PIN และอุปกรณ์ของตนเอง หากเกิดความเสียหายจากการใช้งานผิดวิธี ความประมาท หรือการเปิดเผยข้อมูลโดยผู้ใช้ ทางระบบขอสงวนสิทธิ์ไม่รับผิดชอบต่อความเสียหายดังกล่าว"
                  : "3) Users are responsible for account, password, PIN, and device security. We are not liable for damages caused by user negligence, misuse, or user-side data disclosure."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                disabled={agreementSubmitting}
                onClick={() => router.replace("/login")}
                className="h-11 rounded-xl border-slate-300 text-slate-700"
              >
                {isThai ? "ยังไม่ยอมรับ (กลับไปหน้าเข้าสู่ระบบ)" : "Decline (Back to Login)"}
              </Button>
              <Button onClick={() => void acceptAgreement()} disabled={agreementSubmitting} className="h-11 rounded-xl">
                {agreementSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    {isThai ? "กำลังตรวจสอบและเปิดใช้งาน..." : "Verifying and activating..."}
                  </span>
                ) : (
                  <span>{isThai ? "ตกลง และ เริ่มใช้งานทันที" : "Accept and Continue Now"}</span>
                )}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </MobileShell>
  );
}
