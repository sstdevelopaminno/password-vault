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
    return locale === "th" ? "เน€เธเธชเธเธฑเธเธซเธกเธ”เธญเธฒเธขเธธ เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธซเธกเน" : "Session expired. Please sign in again.";
  }
  if (lower.includes("session synchronization") || lower.includes("sync")) {
    return locale === "th" ? "เธเธณเธฅเธฑเธเธเธดเธเธเนเน€เธเธชเธเธฑเธเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน" : "Session synchronization in progress. Please wait.";
  }

  if (lower.includes("token")) {
    return locale === "th" ? "OTP เนเธกเนเธ–เธนเธเธ•เนเธญเธเธซเธฃเธทเธญเธซเธกเธ”เธญเธฒเธขเธธ" : "Invalid or expired OTP";
  }
  if (lower.includes("rate")) {
    return locale === "th" ? "เธเธญ OTP เธเนเธญเธขเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน" : "OTP rate limited. Please wait.";
  }
  if (text) {
    return text;
  }
  return locale === "th" ? "เธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน" : "Request failed. Please retry.";
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
                ? "เธเธณเธฅเธฑเธเธเธดเธเธเนเน€เธเธชเธเธฑเธเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน"
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
          showToast(isThai ? "เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเน€เธฃเธตเธขเธเธฃเนเธญเธข" : "Signed in successfully", "success");
        }
        setMode("active");
      } catch {
        if (showErrorToast) {
          showToast(isThai ? "เน€เธเธฃเธทเธญเธเนเธฒเธขเนเธกเนเน€เธชเธ–เธตเธขเธฃ เธเธณเธฅเธฑเธเธฅเธญเธเนเธซเธกเน..." : "Network unstable. Retrying...", "error");
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
        isThai ? "เธขเธทเธเธขเธฑเธ OTP เธชเธณเน€เธฃเนเธ เธฃเธฐเธเธเธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเนเธเธฑเธเธเธต" : "OTP verified. System is checking account access.",
        "success",
      );
      setMode("pending");
      return;
    }

    showToast(isThai ? "เธขเธทเธเธขเธฑเธ OTP เธชเธณเน€เธฃเนเธ เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเน€เธฃเธตเธขเธเธฃเนเธญเธข" : "OTP verified. Signed in successfully", "success");
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
    showToast(isThai ? "เธชเนเธ OTP เนเธซเธกเนเนเธฅเนเธง เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธเธญเธตเน€เธกเธฅ" : "OTP resent. Please check your inbox.", "success");
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
        ? "เธขเธทเธเธขเธฑเธ OTP เธเนเธญเธเน€เธเนเธฒเนเธเนเธเธฒเธ"
        : "Verify OTP before access"
      : mode === "pending"
        ? isThai
          ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเนเธเธฑเธเธเธต"
          : "Checking account access"
        : isThai
          ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเน"
          : "Checking access";

  const subtitle =
    mode === "otp"
      ? isThai
        ? "เธเธฃเธญเธเธฃเธซเธฑเธช OTP 6 เธซเธฅเธฑเธเธเธฒเธเธญเธตเน€เธกเธฅเธ—เธตเนเธชเธกเธฑเธเธฃ"
        : "Enter your 6-digit OTP from email"
      : mode === "pending"
        ? isThai
          ? "เธฃเธฐเธเธเธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅเธเธฒเธฃเธขเธทเธเธขเธฑเธเธ•เธฑเธงเธ•เธ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน"
          : "The system is checking identity verification details. Please wait."
        : isThai
          ? "เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน"
          : "Please wait";

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[rgba(2,7,25,0.86)] p-4 backdrop-blur-[2px]">
      <div className="mx-auto mt-8 w-full max-w-[520px]">
        <Card className="relative space-y-4 rounded-[30px] border border-[rgba(123,144,217,0.32)] bg-[linear-gradient(180deg,rgba(8,16,40,0.94),rgba(5,11,30,0.98))] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="pointer-events-none absolute left-4 top-4 h-20 w-20 rounded-2xl neon-dot-grid opacity-50" />
          <h2 className={'relative text-app-h2 font-semibold ' + (mode === "otp" ? 'text-[#f6fbff]' : 'neon-title')}>{title}</h2>
          <p className="relative text-app-body leading-6 text-[#99aed7]">{subtitle}</p>

          {mode === "otp" ? (
            <div className="space-y-3">
              <Input value={email} readOnly className="bg-[rgba(10,18,42,0.72)] text-[#dfecff]" />
              <OtpInput value={otp} onChange={setOtp} length={6} ariaLabel={isThai ? "เธเธฃเธญเธ OTP" : "OTP input"} />

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => router.replace("/login")}>
                  {isThai ? "เธญเธญเธเธเธฒเธเธฃเธฐเธเธ" : "Sign out"}
                </Button>
                <Button onClick={() => void verifyOtpNow()} disabled={loading}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      {isThai ? "เธเธณเธฅเธฑเธเธขเธทเธเธขเธฑเธ..." : "Verifying..."}
                    </span>
                  ) : isThai ? (
                    "เธขเธทเธเธขเธฑเธ OTP"
                  ) : (
                    "Verify OTP"
                  )}
                </Button>
              </div>

              <Button variant="secondary" className="w-full" onClick={() => void resendOtpNow()} disabled={resendDisabled}>
                {resendLoading
                  ? isThai
                    ? "เธเธณเธฅเธฑเธเธชเนเธ OTP..."
                    : "Sending OTP..."
                  : resendIn !== 0
                    ? isThai
                      ? `เธชเนเธเนเธซเธกเนเนเธ ${resendIn} เธงเธดเธเธฒเธ—เธต`
                      : `Resend in ${resendIn}s`
                    : isThai
                      ? "เธชเนเธ OTP เนเธซเธกเน"
                      : "Resend OTP"}
              </Button>
            </div>
          ) : mode === "pending" ? (
            <div className="space-y-3">
              <div
                className="h-[180px] w-full rounded-[24px] border border-[rgba(125,147,222,0.34)] bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${ACCESS_CHECK_ART_URL})` }}
                aria-hidden
              />
              <div className="rounded-2xl border border-[rgba(124,145,220,0.36)] bg-[rgba(11,20,50,0.75)] p-4 text-app-body text-[#c9dcff]">{subtitle}</div>
              <button
                type="button"
                className="h-11 w-full rounded-xl border border-[rgba(123,147,224,0.44)] bg-[linear-gradient(180deg,rgba(10,18,43,0.9),rgba(7,13,33,0.96))] text-app-body font-semibold text-[#d7e7ff] transition hover:text-white"
                onClick={() => void loadProfile(true)}
              >
                {isThai ? "เธ•เธฃเธงเธเธชเธญเธเธญเธตเธเธเธฃเธฑเนเธ" : "Check again"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="h-[190px] w-full rounded-[24px] border border-[rgba(125,147,222,0.34)] bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${ACCESS_CHECK_ART_URL})` }}
                aria-hidden
              />
              <div className="flex items-center justify-center py-1 text-app-body text-[#9eb2da]">
                <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(124,145,220,0.4)] bg-[rgba(10,18,42,0.82)] px-4 py-2 shadow-sm backdrop-blur">
                  <Spinner className="h-4 w-4 border-[rgba(137,154,217,0.45)] border-t-[#36d7ff]" />
                  {isThai ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเน..." : "Checking access..."}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

