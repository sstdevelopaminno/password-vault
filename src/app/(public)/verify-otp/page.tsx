"use client";

import { createElement, useEffect, useState } from "react";
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
 if (!Number.isFinite(seconds)) {
 return 0;
 }
 if (seconds === 0) {
 return 0;
 }
 return seconds;
}

function mapVerifyError(message: unknown, locale: string) {
 const text = String(message ?? "");
 const lower = text.toLowerCase();

 if (lower.includes("token")) {
 return locale === "th" ? "OTP ไม่ถูกต้องหรือหมดอายุ" : "Invalid or expired OTP";
 }
 if (lower.includes("invalid otp")) {
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

export default function VerifyOtpPage() {
 const h = createElement;
 const router = useRouter();
 const searchParams = useSearchParams();
 const { showToast } = useToast();
 const { t, locale } = useI18n();

 const [otp, setOtp] = useState("");
 const [lastAutoOtp, setLastAutoOtp] = useState("");
 const [email, setEmail] = useState("");
 const [loading, setLoading] = useState(false);
 const [resendLoading, setResendLoading] = useState(false);
 const [resendIn, setResendIn] = useState(0);

 useEffect(function () {
 const initialEmail = searchParams.get("email");
 if (initialEmail) {
 setEmail(initialEmail);
 }
 }, [searchParams]);

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

 async function submitOtp(event: any) {
 event.preventDefault();
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
 body: JSON.stringify({ otp, email, purpose: "signup" }),
 });
 setLoading(false);

 if (res.ok) {
 showToast(locale === "th" ? "ยืนยัน OTP สำเร็จ กำลังรออนุมัติอัตโนมัติ" : "OTP verified. Waiting for auto approval", "success");
 setLastAutoOtp("");
 router.push("/home");
 return;
 }

 const body = (await res.json().catch(function () { return {}; })) as { error?: string };
 showToast(mapVerifyError(body.error, locale), "error");
 }

 async function resendOtp() {
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

 const body = (await res.json().catch(function () { return {}; })) as { error?: string; retryAfterSec?: number };
 setResendLoading(false);

 if (!res.ok) {
 const retry = parseRetrySeconds(String(body.error ?? ""));
 if (retry !== 0) {
 setResendIn(retry);
 }
 showToast(mapVerifyError(body.error, locale), "error");
 return;
 }

 const retryAfter = Number(body.retryAfterSec ?? 60);
 if (Number.isFinite(retryAfter)) {
 if (retryAfter !== 0) {
 setResendIn(retryAfter);
 }
 }

 showToast(locale === "th" ? "ส่ง OTP ใหม่แล้ว กรุณาตรวจสอบอีเมล" : "OTP resent. Please check your inbox", "success");
 }

 useEffect(function () {
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
 const event = { preventDefault: function () {} };
 void submitOtp(event);
 }, [otp, loading]);

 const submitLabel = loading
 ? h("span", { className: "inline-flex items-center gap-2" }, h(Spinner, null), locale === "th" ? "กำลังยืนยัน..." : "Verifying...")
 : t("verifyOtp.verify");

 let resendDisabled = false;
 if (resendLoading) {
 resendDisabled = true;
 }
 if (resendIn !== 0) {
 resendDisabled = true;
 }

 const resendLabel = resendLoading
 ? locale === "th" ? "กำลังส่ง OTP..." : "Sending OTP..."
 : resendIn !== 0
 ? locale === "th" ? "ขอใหม่ใน " + String(resendIn) + " วินาที" : "Resend in " + String(resendIn) + "s"
 : locale === "th" ? "ส่ง OTP ใหม่" : "Resend OTP";

 const form = h(
 "form",
 { className: "space-y-4", onSubmit: submitOtp },
 h(Input, {
 type: "email",
 placeholder: t("verifyOtp.email"),
 value: email,
 onChange: function (e: any) {
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
 h("div", { className: "grid grid-cols-2 gap-2" },
 h(Button, { variant: "secondary", type: "button", onClick: function () { void resendOtp(); }, disabled: resendDisabled }, resendLabel),
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
