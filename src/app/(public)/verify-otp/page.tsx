"use client";

import {
  Suspense,
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
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
  if (!matched) {
    return 0;
  }
  const seconds = Number(matched[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return seconds;
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
  const h = createElement;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { t, locale } = useI18n();

  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const autoSubmittedOtpRef = useRef("");

  useEffect(
    function () {
      if (resendIn === 0) {
        return;
      }
      const timer = window.setInterval(function () {
        setResendIn(function (value) {
          if (value <= 0) {
            return 0;
          }
          return value - 1;
        });
      }, 1000);
      return function () {
        window.clearInterval(timer);
      };
    },
    [resendIn],
  );

  const submitOtp = useCallback(
    async function (event?: Pick<FormEvent<HTMLFormElement>, "preventDefault">) {
      event?.preventDefault();
      if (loading || otp.length !== 6) {
        return;
      }

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
            locale === "th"
              ? "ยืนยัน OTP สำเร็จ กำลังรออนุมัติอัตโนมัติ"
              : "OTP verified. Waiting for auto approval",
            "success",
          );
          router.push("/home");
          return;
        }

        const body = (await res.json().catch(function () {
          return {};
        })) as { error?: string };
        showToast(mapVerifyError(body.error, locale), "error");
      } finally {
        setLoading(false);
      }
    },
    [email, loading, locale, otp, router, showToast],
  );

  const resendOtp = useCallback(async () => {
    if (resendLoading || resendIn !== 0) {
      return;
    }

    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = (await res.json().catch(function () {
        return {};
      })) as { error?: string; retryAfterSec?: number };

      if (!res.ok) {
        const retry = parseRetrySeconds(String(body.error ?? ""));
        if (retry > 0) {
          setResendIn(retry);
        }
        showToast(mapVerifyError(body.error, locale), "error");
        return;
      }

      const retryAfter = Number(body.retryAfterSec ?? 60);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setResendIn(retryAfter);
      }

      showToast(
        locale === "th" ? "ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบอีเมล" : "OTP resent. Please check your inbox",
        "success",
      );
    } finally {
      setResendLoading(false);
    }
  }, [email, locale, resendIn, resendLoading, showToast]);

  useEffect(
    function () {
      if (loading) {
        return;
      }
      if (otp.length !== 6) {
        autoSubmittedOtpRef.current = "";
        return;
      }
      if (otp === autoSubmittedOtpRef.current) {
        return;
      }
      autoSubmittedOtpRef.current = otp;
      void submitOtp();
    },
    [loading, otp, submitOtp],
  );

  const submitLabel = loading
    ? h(
        "span",
        { className: "inline-flex items-center gap-2" },
        h(Spinner, null),
        t("verifyOtp.verifying"),
      )
    : t("verifyOtp.verify");

  const resendDisabled = resendLoading || resendIn !== 0;
  const resendLabel = resendLoading
    ? (locale === "th" ? "กำลังส่ง OTP..." : "Sending OTP...")
    : resendIn !== 0
      ? (locale === "th" ? "ขอใหม่ใน " + String(resendIn) + " วินาที" : "Resend in " + String(resendIn) + "s")
      : (locale === "th" ? "ส่ง OTP ใหม่" : "Resend OTP");

  const form = h(
    "form",
    { className: "space-y-4", onSubmit: submitOtp },
    h(Input, {
      type: "email",
      placeholder: t("verifyOtp.email"),
      value: email,
      onChange: function (e: ChangeEvent<HTMLInputElement>) {
        setEmail(e.target.value);
      },
      required: true,
    }),
    h(OtpInput, {
      value: otp,
      onChange: function (next: string) {
        setOtp(next);
      },
      length: 6,
      ariaLabel: t("otpInput.ariaLabel"),
    }),
    h(
      "div",
      { className: "grid grid-cols-2 gap-2" },
      h(
        Button,
        {
          variant: "secondary",
          type: "button",
          onClick: function () {
            void resendOtp();
          },
          disabled: resendDisabled,
        },
        resendLabel,
      ),
      h(Button, { className: "w-full", disabled: loading ? true : otp.length !== 6 }, submitLabel),
    ),
  );

  const card = h(
    Card,
    { className: "w-full space-y-4 animate-slide-up" },
    h("h1", { className: "text-xl font-semibold" }, t("verifyOtp.title")),
    form,
  );

  return h(MobileShell, null, h("main", { className: "flex flex-1 items-center px-5 py-8" }, card));
}

export default function VerifyOtpPage() {
  const h = createElement;
  const fallback = h(
    MobileShell,
    null,
    h(
      "main",
      { className: "flex flex-1 items-center px-5 py-8" },
      h(
        Card,
        { className: "w-full space-y-4 animate-slide-up" },
        h("h1", { className: "text-xl font-semibold" }, "Verify OTP"),
        h("div", { className: "flex items-center justify-center py-4" }, h(Spinner, null)),
      ),
    ),
  );
  return h(Suspense, { fallback }, h(VerifyOtpContent, null));
}
