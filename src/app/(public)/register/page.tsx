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
    return locale === "th" ? "เธเนเธญเธกเธนเธฅเธชเธกเธฑเธเธฃเธชเธกเธฒเธเธดเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ" : "Invalid signup payload";
  }
  if (lower.includes("email already registered")) {
    return locale === "th" ? "เธญเธตเน€เธกเธฅเธเธตเนเธ–เธนเธเนเธเนเธเธฒเธเนเธฅเนเธง" : "Email already registered";
  }
  if (lower.includes("token") || lower.includes("invalid otp")) {
    return locale === "th" ? "OTP เนเธกเนเธ–เธนเธเธ•เนเธญเธเธซเธฃเธทเธญเธซเธกเธ”เธญเธฒเธขเธธ" : "Invalid or expired OTP";
  }
  if (isOtpRateLimited(text)) {
    return locale === "th" ? "เธเธญ OTP เธเนเธญเธขเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน" : "OTP rate limited. Please wait.";
  }
  if (lower.includes("unable to send otp right now")) {
    return locale === "th" ? "เธขเธฑเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธชเนเธ OTP เนเธ”เนเนเธเธเธ“เธฐเธเธตเน เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน" : "Unable to send OTP right now. Please try again.";
  }
  if (lower.includes("otp delivery service unavailable")) {
    return locale === "th" ? "เธฃเธฐเธเธเธชเนเธ OTP เธขเธฑเธเนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน" : "OTP delivery service unavailable. Please try again.";
  }

  return text || fallback;
}

function mapRegisterSuccess(message: unknown, locale: "th" | "en", fallback: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("otp sent")) {
    return locale === "th" ? "เธชเนเธ OTP เนเธเธ—เธตเนเธญเธตเน€เธกเธฅเนเธฅเนเธง" : "OTP sent to your email";
  }
  if (lower.includes("account is now active")) {
    return locale === "th" ? "เธขเธทเธเธขเธฑเธ OTP เธชเธณเน€เธฃเนเธ เธเธฑเธเธเธตเธเธฃเนเธญเธกเนเธเนเธเธฒเธเนเธฅเนเธง" : "OTP verified. Account is active.";
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
              ? "เธญเธตเน€เธกเธฅเธเธตเนเธ–เธนเธเนเธเนเธเธฒเธเนเธฅเนเธง เธเธฃเธธเธ“เธฒเนเธเนเธญเธตเน€เธกเธฅเธญเธทเนเธ"
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
      return isThai ? "เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธเนเธญเธกเธนเธฅเนเธซเนเธเธฃเธเธเนเธญเธเธเธญ OTP" : "Please fill in all fields before requesting OTP.";
    }
    if (!emailFormatValid) {
      return isThai ? "เธฃเธนเธเนเธเธเธญเธตเน€เธกเธฅเนเธกเนเธ–เธนเธเธ•เนเธญเธ" : "Invalid email format.";
    }
    if (form.password.length < 8) {
      return isThai ? "เธฃเธซเธฑเธชเธเนเธฒเธเธ•เนเธญเธเธญเธขเนเธฒเธเธเนเธญเธข 8 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ" : "Password must be at least 8 characters.";
    }
    if (passwordMismatch) {
      return isThai ? "เธฃเธซเธฑเธชเธเนเธฒเธเนเธฅเธฐเธขเธทเธเธขเธฑเธเธฃเธซเธฑเธชเธเนเธฒเธเนเธกเนเธ•เธฃเธเธเธฑเธ" : "Passwords do not match.";
    }
    if (emailExists) {
      return isThai ? "เธญเธตเน€เธกเธฅเธเธตเนเธ–เธนเธเนเธเนเธเธฒเธเนเธฅเนเธง เธเธฃเธธเธ“เธฒเนเธเนเธญเธตเน€เธกเธฅเธญเธทเนเธ" : "This email is already registered. Please use another email.";
    }
    if (emailChecking) {
      return isThai ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธญเธตเน€เธกเธฅ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน" : "Checking email. Please wait.";
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
          ? `เธเธญ OTP เธเนเธญเธขเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฃเธญ ${waitSec} เธงเธดเธเธฒเธ—เธต`
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
          ? `เธเธญ OTP เธเนเธญเธขเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฃเธญ ${waitSec} เธงเธดเธเธฒเธ—เธต`
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
      mapRegisterSuccess(body.message, locale, isThai ? "เธชเธกเธฑเธเธฃเธชเธณเน€เธฃเนเธ เธเธฑเธเธเธตเธเธฃเนเธญเธกเนเธเนเธเธฒเธเนเธฅเนเธง" : "Registration complete. Account is active."),
      "success",
    );

    if (hasAcceptedTerms()) {
      router.replace("/home");
      return;
    }

    setAgreementOpen(true);
  }

  function acceptAgreement() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TERMS_ACK_STORAGE_KEY, TERMS_ACK_VERSION);
    }
    setAgreementOpen(false);
    router.replace("/home");
  }

  return (
    <MobileShell>
      <main className="flex flex-1 items-center px-5 py-8">
        <Card className="w-full space-y-4 animate-slide-up">
          <h1 className="text-app-h2 font-semibold">{t("register.title")}</h1>

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
                    <p className="text-app-caption text-slate-500">
                      {isThai ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธญเธตเน€เธกเธฅ..." : "Checking email..."}
                    </p>
                  ) : null}
                  {emailInlineError ? <p className="text-app-body text-rose-600">{emailInlineError}</p> : null}
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
                    <p className="text-app-body text-rose-600">
                      {isThai ? "เธฃเธซเธฑเธชเธเนเธฒเธเนเธฅเธฐเธขเธทเธเธขเธฑเธเธฃเธซเธฑเธชเธเนเธฒเธเนเธกเนเธ•เธฃเธเธเธฑเธ" : "Passwords do not match."}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3">
                <p className="text-app-body text-slate-600">
                  {isThai ? "เธเธฃเธธเธ“เธฒเธเธฃเธญเธ OTP 6 เธซเธฅเธฑเธเธเธฒเธเธญเธตเน€เธกเธฅเน€เธเธทเนเธญเธขเธทเธเธขเธฑเธเธเธฒเธฃเธชเธกเธฑเธเธฃ" : "Please enter the 6-digit OTP from your email."}
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
                    {isThai ? "เนเธเนเนเธเธเนเธญเธกเธนเธฅ" : "Edit info"}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading || resendIn > 0}
                    onClick={() => void resendOtp()}
                  >
                    {resendIn > 0
                      ? isThai
                        ? `เธเธญเนเธซเธกเนเนเธ ${resendIn}s`
                        : `Resend in ${resendIn}s`
                      : t("register.sendOtp")}
                  </Button>
                </div>
              </div>
            )}

            {error ? <p className="text-app-body text-rose-600">{error}</p> : null}

            <Button
              className="w-full"
              disabled={otpSent ? loading || otp.length !== 6 : !canRequestOtp}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {otpSent ? t("register.creating") : t("register.sendingOtp")}
                </span>
              ) : otpSent ? (
                isThai ? "เธขเธทเธเธขเธฑเธ OTP เนเธฅเธฐเน€เธเนเธฒเนเธเนเธเธฒเธ" : "Verify OTP and continue"
              ) : (
                t("register.sendOtp")
              )}
            </Button>
          </form>
        </Card>
      </main>

      {agreementOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-[560px] space-y-3 rounded-3xl bg-white p-5">
            <h2 className="text-app-h3 font-semibold text-slate-900">
              {isThai ? "เธเนเธญเธ•เธเธฅเธเธเธฒเธฃเนเธเนเธเธฒเธเธฃเธฐเธเธ" : "Terms of Use"}
            </h2>

            <p className="text-app-body leading-6 text-slate-700">
              {isThai
                ? "เธเนเธญเธเน€เธเนเธฒเนเธเนเธเธฒเธ เธเธฃเธธเธ“เธฒเธญเนเธฒเธเนเธฅเธฐเธขเธญเธกเธฃเธฑเธเธเนเธญเธ•เธเธฅเธเธ•เนเธญเนเธเธเธตเน"
                : "Before proceeding, please read and accept the terms below."}
            </p>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-app-body leading-6 text-slate-700">
              <p>
                {isThai
                  ? "1) เธฃเธฐเธเธเธกเธตเธเธฑเธเธเนเธเธฑเธเธซเธฅเธฑเธเธ”เนเธฒเธเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข เน€เธเนเธ OTP, PIN เนเธฅเธฐเธเธฒเธฃเน€เธเนเธฒเธฃเธซเธฑเธชเธเนเธญเธกเธนเธฅ"
                  : "1) The app includes core security features such as OTP, PIN, and data encryption."}
              </p>
              <p>
                {isThai
                  ? "2) เธ—เธตเธกเธเธฒเธเนเธซเนเธเธฒเธฃเธ”เธนเนเธฅเนเธฅเธฐเนเธเนเนเธเธเธฑเธเธซเธฒเธฃเธฐเธเธเธ•เธฅเธญเธ” 24/7 เน€เธเธทเนเธญเนเธซเนเธเธนเนเนเธเนเนเธเนเธเธฒเธเนเธ”เนเธญเธขเนเธฒเธเธ•เนเธญเน€เธเธทเนเธญเธ"
                  : "2) Our team provides 24/7 support and incident response to keep the service available."}
              </p>
              <p>
                {isThai
                  ? "3) เธเธนเนเนเธเนเธ•เนเธญเธเธฃเธฑเธเธฉเธฒเธเธงเธฒเธกเธฅเธฑเธเธเธญเธเธเธฑเธเธเธต เธฃเธซเธฑเธชเธเนเธฒเธ PIN เนเธฅเธฐเธญเธธเธเธเธฃเธ“เนเธเธญเธเธ•เธเน€เธญเธ เธซเธฒเธเน€เธเธดเธ”เธเธงเธฒเธกเน€เธชเธตเธขเธซเธฒเธขเธเธฒเธเธเธฒเธฃเนเธเนเธเธฒเธเธเธดเธ”เธงเธดเธเธต เธเธงเธฒเธกเธเธฃเธฐเธกเธฒเธ— เธซเธฃเธทเธญเธเธฒเธฃเน€เธเธดเธ”เน€เธเธขเธเนเธญเธกเธนเธฅเนเธ”เธขเธเธนเนเนเธเน เธ—เธฒเธเธฃเธฐเธเธเธเธญเธชเธเธงเธเธชเธดเธ—เธเธดเนเนเธกเนเธฃเธฑเธเธเธดเธ”เธเธญเธเธ•เนเธญเธเธงเธฒเธกเน€เธชเธตเธขเธซเธฒเธขเธ”เธฑเธเธเธฅเนเธฒเธง"
                  : "3) Users are responsible for account, password, PIN, and device security. We are not liable for damages caused by user negligence, misuse, or user-side data disclosure."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => router.replace("/login")}>
                {isThai ? "เธขเธฑเธเนเธกเนเธขเธญเธกเธฃเธฑเธ (เธเธฅเธฑเธเนเธเธซเธเนเธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ)" : "Decline (Back to Login)"}
              </Button>
              <Button onClick={acceptAgreement}>
                {isThai ? "เธขเธญเธกเธฃเธฑเธเธเนเธญเธ•เธเธฅเธเนเธฅเธฐเน€เธฃเธดเนเธกเนเธเนเธเธฒเธ" : "Accept and Continue"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </MobileShell>
  );
}

