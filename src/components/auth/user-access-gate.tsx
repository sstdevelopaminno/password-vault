"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { PinSessionGate } from "@/components/auth/pin-session-gate";
import { clampPinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC } from "@/lib/pin-session";

const POLL_MS = 5000;

function parseRetrySeconds(message: string) {
  const matched = String(message).match(/after\s+(\d+)\s*seconds?/i);
  if (!matched) {
    return 0;
  }
  const seconds = Number(matched[1]);
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  if (seconds === 0) {
    return 0;
  }
  return seconds;
}

function mapGateError(message: unknown, locale: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("token")) {
    if (locale === "th") {
      return "OTP เนเธกเนเธ–เธนเธเธ•เนเธญเธเธซเธฃเธทเธญเธซเธกเธ”เธญเธฒเธขเธธ";
    }
    return "Invalid or expired OTP";
  }

  if (lower.includes("rate")) {
    if (locale === "th") {
      return "เธเธญ OTP เธเนเธญเธขเน€เธเธดเธเนเธ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน";
    }
    return "OTP rate limited. Please wait.";
  }

  if (text) {
    return text;
  }

  if (locale === "th") {
    return "เธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน";
  }
  return "Request failed. Please retry.";
}

export function UserAccessGate(props: { children: React.ReactNode }) {
  const h = createElement;
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const { locale } = useI18n();

  const [mode, setMode] = useState("loading");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [lastAutoOtp, setLastAutoOtp] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [pinSessionEnabled, setPinSessionEnabled] = useState(true);
  const [pinSessionTimeoutSec, setPinSessionTimeoutSec] = useState(DEFAULT_PIN_SESSION_TIMEOUT_SEC);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const unauthorizedRef = useRef(0);

  async function loadProfile(showErrorToast: boolean) {
    try {
      const res = await fetch("/api/profile/me", { cache: "no-store" });

      if (res.status === 401) {
        unauthorizedRef.current += 1;
        if (unauthorizedRef.current >= 3) {
          router.replace("/login");
          return;
        }
        window.setTimeout(function () {
          void loadProfile(false);
        }, 1200 * unauthorizedRef.current);
        return;
      }

      unauthorizedRef.current = 0;

      const body = await res.json().catch(function () {
        return {};
      });

      if (!res.ok) {
        if (showErrorToast) {
          showToast(mapGateError((body as { error?: string }).error, locale), "error");
        }
        setMode("error");
        return;
      }

      const payload = body as {
        email?: string;
        needsOtpVerification?: boolean;
        pendingApproval?: boolean;
        hasPin?: boolean;
        pinSessionEnabled?: boolean;
        pinSessionTimeoutSec?: unknown;
        userId?: string;
      };
      const nextEmail = String(payload.email ?? "");
      const needsOtp = Boolean(payload.needsOtpVerification);
      const pending = Boolean(payload.pendingApproval);
      setEmail(nextEmail);
      setHasPin(Boolean(payload.hasPin));
      setPinSessionEnabled(payload.pinSessionEnabled !== false);
      setPinSessionTimeoutSec(
        clampPinSessionTimeoutSec(payload.pinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC),
      );
      setUserId(String(payload.userId ?? ""));

      if (needsOtp) {
        setMode("otp");
        return;
      }

      if (pending) {
        setMode("pending");
        return;
      }

      if (mode !== "active") {
        if (locale === "th") {
          showToast("เธญเธเธธเธกเธฑเธ•เธดเธชเธณเน€เธฃเนเธ เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเน€เธฃเธตเธขเธเธฃเนเธญเธข", "success");
        } else {
          showToast("Approved successfully", "success");
        }
      }

      setMode("active");
    } catch {
      if (showErrorToast) {
        showToast(locale === "th" ? "เน€เธเธฃเธทเธญเธเนเธฒเธขเนเธกเนเน€เธชเธ–เธตเธขเธฃ เธเธณเธฅเธฑเธเธฅเธญเธเนเธซเธกเน..." : "Network unstable. Retrying...", "error");
      }
      window.setTimeout(function () {
        void loadProfile(false);
      }, 1200);
    }
  }

  async function verifyOtpNow() {
    if (loading) {
      return;
    }
    if (otp.length !== 6) {
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, purpose: "signup" }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(function () {
        return {};
      });
      showToast(mapGateError((body as { error?: string }).error, locale), "error");
      return;
    }

    if (locale === "th") {
      showToast("เธขเธทเธเธขเธฑเธ OTP เธชเธณเน€เธฃเนเธ เธเธณเธฅเธฑเธเธฃเธญเธญเธเธธเธกเธฑเธ•เธดเธญเธฑเธ•เนเธเธกเธฑเธ•เธด", "success");
    } else {
      showToast("OTP verified. Waiting for auto approval", "success");
    }

    setOtp("");
    setLastAutoOtp("");
    setMode("pending");
  }

  async function resendOtpNow() {
    if (resendLoading) {
      return;
    }
    if (resendIn !== 0) {
      return;
    }

    setResendLoading(true);

    const res = await fetch("/api/auth/resend-signup-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const body = await res.json().catch(function () {
      return {};
    });

    setResendLoading(false);

    if (!res.ok) {
      const retry = parseRetrySeconds(String((body as { error?: string }).error ?? ""));
      if (retry !== 0) {
        setResendIn(retry);
      }
      showToast(mapGateError((body as { error?: string }).error, locale), "error");
      return;
    }

    const retryAfter = Number((body as { retryAfterSec?: number }).retryAfterSec ?? 60);
    if (Number.isFinite(retryAfter)) {
      if (retryAfter !== 0) {
        setResendIn(retryAfter);
      }
    }

    if (locale === "th") {
      showToast("เธชเนเธ OTP เนเธซเธกเนเนเธฅเนเธง เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธเธญเธตเน€เธกเธฅ", "success");
    } else {
      showToast("OTP resent. Please check your inbox", "success");
    }
  }

  useEffect(function () {
 void loadProfile(true);
 }, []);

 useEffect(function () {
 void loadProfile(false);
 }, [pathname]);

 useEffect(function () {
 function onPinSecurityUpdated(event: Event) {
 const detail = ((event as CustomEvent<{ pinSessionEnabled?: boolean; pinSessionTimeoutSec?: unknown }>).detail ??
 {}) as { pinSessionEnabled?: boolean; pinSessionTimeoutSec?: unknown };
 setPinSessionEnabled(detail.pinSessionEnabled !== false);
 setPinSessionTimeoutSec(
 clampPinSessionTimeoutSec(detail.pinSessionTimeoutSec, DEFAULT_PIN_SESSION_TIMEOUT_SEC),
 );
 }

 window.addEventListener('pv-pin-security-updated', onPinSecurityUpdated as EventListener);
 return function () {
 window.removeEventListener('pv-pin-security-updated', onPinSecurityUpdated as EventListener);
 };
 }, []);

 useEffect(function () {
    if (resendIn === 0) {
      return;
    }
    const timer = window.setInterval(function () {
      setResendIn(function (value) {
        if (value === 0) {
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return function () {
      window.clearInterval(timer);
    };
  }, [resendIn]);

  useEffect(function () {
    if (mode !== "pending") {
      return;
    }
    const timer = window.setInterval(function () {
      void loadProfile(false);
    }, POLL_MS);
    return function () {
      window.clearInterval(timer);
    };
  }, [mode]);

  useEffect(function () {
    if (mode !== "active" || hasPin || !pinSessionEnabled) {
      return;
    }
    const timer = window.setInterval(function () {
      void loadProfile(false);
    }, 2500);
    return function () {
      window.clearInterval(timer);
    };
  }, [mode, hasPin, pinSessionEnabled]);

  useEffect(function () {
    if (mode !== "otp") {
      return;
    }
    if (loading) {
      return;
    }
    if (otp.length !== 6) {
      if (lastAutoOtp !== "") {
        setLastAutoOtp("");
      }
      return;
    }
    if (otp === lastAutoOtp) {
      return;
    }
    setLastAutoOtp(otp);
    void verifyOtpNow();
  }, [mode, loading, otp]);

  if (mode === "active") {
    return h(
      PinSessionGate,
      { hasPin, userId, pinSessionEnabled, pinSessionTimeoutSec },
      props.children,
    );
  }

  let resendDisabled = false;
  if (resendLoading) {
    resendDisabled = true;
  }
  if (resendIn !== 0) {
    resendDisabled = true;
  }

  const title = mode === "otp"
    ? locale === "th" ? "เธขเธทเธเธขเธฑเธ OTP เธเนเธญเธเน€เธเนเธฒเนเธเนเธเธฒเธ" : "Verify OTP before access"
    : mode === "pending"
      ? locale === "th" ? "เธฃเธญเธญเธเธธเธกเธฑเธ•เธดเธญเธฑเธ•เนเธเธกเธฑเธ•เธด" : "Waiting for auto approval"
      : locale === "th" ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเน" : "Checking access";

  const subtitle = mode === "otp"
    ? locale === "th" ? "เธเธฃเธญเธเธฃเธซเธฑเธช OTP 6 เธซเธฅเธฑเธเธเธฒเธเธญเธตเน€เธกเธฅเธ—เธตเนเธชเธกเธฑเธเธฃ" : "Enter your 6-digit OTP from email"
    : mode === "pending"
      ? locale === "th" ? "เธฃเธฐเธเธเธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅ OTP เนเธฅเธฐเธญเธเธธเธกเธฑเธ•เธดเธ เธฒเธขเนเธ 1-2 เธเธฒเธ—เธต" : "System is validating OTP and auto-approving within 1-2 minutes"
      : locale === "th" ? "เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน" : "Please wait";

  const otpPanel = h("div", { className: "space-y-3" },
    h(Input, { value: email, readOnly: true, className: "bg-slate-50 text-slate-600" }),
    h(OtpInput, { value: otp, onChange: setOtp, length: 6, ariaLabel: locale === "th" ? "เธเธฃเธญเธ OTP" : "OTP input" }),
    h("div", { className: "grid grid-cols-2 gap-2" },
      h(Button, { variant: "secondary", onClick: function () { router.replace("/login"); } }, locale === "th" ? "เธญเธญเธเธเธฒเธเธฃเธฐเธเธ" : "Sign out"),
      h(Button, { onClick: function () { void verifyOtpNow(); }, disabled: loading },
        loading
          ? h("span", { className: "inline-flex items-center gap-2" }, h(Spinner, null), locale === "th" ? "เธเธณเธฅเธฑเธเธขเธทเธเธขเธฑเธ..." : "Verifying...")
          : locale === "th" ? "เธขเธทเธเธขเธฑเธ OTP" : "Verify OTP",
      ),
    ),
    h(Button, { variant: "secondary", className: "w-full", onClick: function () { void resendOtpNow(); }, disabled: resendDisabled },
      resendLoading
        ? locale === "th" ? "เธเธณเธฅเธฑเธเธชเนเธ OTP..." : "Sending OTP..."
        : resendIn !== 0
          ? locale === "th" ? "เธชเนเธเนเธซเธกเนเนเธ " + String(resendIn) + " เธงเธดเธเธฒเธ—เธต" : "Resend in " + String(resendIn) + "s"
          : locale === "th" ? "เธชเนเธ OTP เนเธซเธกเน" : "Resend OTP",
    ),
  );

  const pendingPanel = h("div", { className: "space-y-3" },
    h("div", { className: "rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-800" }, subtitle),
    h(Button, { variant: "secondary", className: "w-full", onClick: function () { void loadProfile(true); } }, locale === "th" ? "เธ•เธฃเธงเธเธชเธญเธเธญเธตเธเธเธฃเธฑเนเธ" : "Check again"),
  );

  const loadingPanel = h("div", { className: "flex items-center justify-center py-6 text-sm text-slate-500" },
    h("span", { className: "inline-flex items-center gap-2" },
      h(Spinner, { className: "h-4 w-4 border-slate-300 border-t-slate-600" }),
      locale === "th" ? "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเน..." : "Checking access...",
    ),
  );

  const panel = mode === "otp" ? otpPanel : mode === "pending" ? pendingPanel : loadingPanel;

  return h("div", { className: "fixed inset-0 z-[60] bg-slate-950/40 p-4 backdrop-blur-[2px]" },
    h("div", { className: "mx-auto mt-16 w-full max-w-[520px]" },
      h(Card, { className: "space-y-4 rounded-[24px] border border-[var(--border-strong)] bg-white p-5" },
        h("h2", { className: "text-lg font-semibold text-slate-900" }, title),
        panel,
      ),
    ),
  );
}


