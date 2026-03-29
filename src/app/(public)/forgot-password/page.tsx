"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OtpInput } from "@/components/auth/otp-input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

type Method = "" | "email" | "pin";
type EmailStep = "search" | "otp" | "password";

function mapError(message: unknown, locale: "th" | "en") {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return locale === "th" ? "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" : "Invalid login credentials";
  }
  if (lower.includes("rate limit")) {
    return locale === "th" ? "OTP ถูกจำกัดความถี่ กรุณารอสักครู่" : "OTP rate limited. Please wait.";
  }
  if (lower.includes("invalid otp") || lower.includes("token")) {
    return locale === "th" ? "OTP ไม่ถูกต้องหรือหมดอายุ" : "Invalid or expired OTP";
  }
  if (lower.includes("account not found")) {
    return locale === "th" ? "ไม่พบบัญชีอีเมลนี้" : "Account not found";
  }
  if (lower.includes("account is not approved yet")) {
    return locale === "th" ? "บัญชียังไม่เปิดใช้งาน" : "Account is not approved yet";
  }
  if (lower.includes("pin")) {
    return locale === "th" ? "PIN ไม่ถูกต้อง" : "Invalid PIN";
  }
  return text || (locale === "th" ? "เกิดข้อผิดพลาด" : "Something went wrong");
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { locale } = useI18n();

  const [method, setMethod] = useState<Method>("");

  const [emailStep, setEmailStep] = useState<EmailStep>("search");
  const [email, setEmail] = useState("");
  const [foundEmail, setFoundEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [pinEmail, setPinEmail] = useState("");
  const [pin, setPin] = useState("");
  const [pinNewPassword, setPinNewPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const text = {
    title: locale === "th" ? "ลืมรหัสผ่าน" : "Forgot password",
    chooseMethod: locale === "th" ? "เลือกวิธียืนยันตัวตน" : "Choose verification method",
    byEmail: locale === "th" ? "ใส่อีเมลปัจจุบันของคุณ" : "Use current email",
    byPin: locale === "th" ? "ยืนยัน PIN" : "Verify PIN",
    searchEmail: locale === "th" ? "ค้นหาอีเมล" : "Find email",
    emailPlaceholder: locale === "th" ? "อีเมลปัจจุบัน" : "Current email",
    foundLabel: locale === "th" ? "พบบัญชีอีเมล" : "Found account email",
    sendOtp: locale === "th" ? "ยืนยันและส่ง OTP" : "Confirm and send OTP",
    otpTitle: locale === "th" ? "กรอกรหัส OTP ที่ส่งไปยังอีเมล" : "Enter OTP sent to your email",
    verifyOtp: locale === "th" ? "ยืนยัน OTP" : "Verify OTP",
    newPassword: locale === "th" ? "รหัสผ่านใหม่" : "New password",
    saveAndLogin: locale === "th" ? "บันทึกและเข้าสู่ระบบอัตโนมัติ" : "Save and auto login",
    pinPlaceholder: locale === "th" ? "PIN 6 หลัก" : "6-digit PIN",
    back: locale === "th" ? "ย้อนกลับ" : "Back",
    resendIn: locale === "th" ? "ส่งใหม่ใน" : "Resend in",
  };

  async function findEmail() {
    setLoading(true);
    const res = await fetch("/api/auth/find-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      showToast(mapError(body?.error, locale), "error");
      return;
    }

    const found = String(body?.email ?? "");
    setFoundEmail(found);
    showToast(locale === "th" ? "พบอีเมลแล้ว กรุณายืนยันเพื่อรับ OTP" : "Email found. Confirm to receive OTP.", "success");
  }

  async function confirmAndSendOtp() {
    if (!foundEmail) return;
    if (resendIn > 0) {
      showToast(`${text.resendIn} ${resendIn}s`, "error");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: foundEmail }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      showToast(mapError(body?.error, locale), "error");
      if (res.status === 429) {
        setResendIn(Number(body?.retryAfterSec || 60));
      }
      return;
    }

    setOtp("");
    setEmailStep("otp");
    setResendIn(60);
    showToast(locale === "th" ? "ส่ง OTP ไปยังอีเมลแล้ว" : "OTP sent to your email", "success");
  }

  async function verifyOtpThenNext() {
    if (otp.length !== 6) {
      showToast(locale === "th" ? "กรอก OTP 6 หลัก" : "Enter 6-digit OTP", "error");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/verify-reset-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: foundEmail, otp }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      showToast(mapError(body?.error, locale), "error");
      return;
    }

    setEmailStep("password");
    showToast(locale === "th" ? "ยืนยัน OTP สำเร็จ" : "OTP verified", "success");
  }

  async function finalizeByOtp(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast(locale === "th" ? "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร" : "Password must be at least 8 characters", "error");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password-finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      showToast(mapError(body?.error, locale), "error");
      return;
    }

    showToast(locale === "th" ? "รีเซ็ตรหัสผ่านสำเร็จ และเข้าสู่ระบบแล้ว" : "Password reset complete. Logged in.", "success");
    router.push("/home");
  }

  async function resetByPin(e: React.FormEvent) {
    e.preventDefault();

    if (pin.length !== 6) {
      showToast(locale === "th" ? "กรอก PIN 6 หลัก" : "Enter 6-digit PIN", "error");
      return;
    }

    if (pinNewPassword.length < 8) {
      showToast(locale === "th" ? "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร" : "Password must be at least 8 characters", "error");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pinEmail, pin, newPassword: pinNewPassword }),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      showToast(mapError(body?.error, locale), "error");
      return;
    }

    showToast(locale === "th" ? "เปลี่ยนรหัสผ่านสำเร็จ และเข้าสู่ระบบแล้ว" : "Password changed. Logged in.", "success");
    router.push("/home");
  }

  return (
    <MobileShell>
      <main className="flex flex-1 items-center px-5 py-8">
        <Card className="w-full space-y-4">
          <h1 className="text-xl font-semibold">{text.title}</h1>

          {!method && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{text.chooseMethod}</p>
              <Button className="w-full" onClick={() => setMethod("email")}>{text.byEmail}</Button>
              <Button className="w-full" variant="secondary" onClick={() => setMethod("pin")}>{text.byPin}</Button>
            </div>
          )}

          {method === "email" && (
            <div className="space-y-3">
              {emailStep === "search" && (
                <>
                  <Input type="email" placeholder={text.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Button className="w-full" variant="secondary" onClick={() => void findEmail()} disabled={loading}>
                    {loading ? <span className="inline-flex items-center gap-2"><Spinner />...</span> : text.searchEmail}
                  </Button>
                  {foundEmail ? (
                    <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs text-blue-700">{text.foundLabel}</p>
                      <p className="text-sm font-semibold text-blue-900">{foundEmail}</p>
                      <Button className="w-full" onClick={() => void confirmAndSendOtp()} disabled={loading || resendIn > 0}>
                        {resendIn > 0 ? `${text.resendIn} ${resendIn}s` : text.sendOtp}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}

              {emailStep === "otp" && (
                <>
                  <p className="text-sm text-slate-700">{text.otpTitle}</p>
                  <OtpInput value={otp} onChange={setOtp} length={6} ariaLabel={locale === "th" ? "กรอก OTP" : "Enter OTP"} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setEmailStep("search")} disabled={loading}>{text.back}</Button>
                    <Button onClick={() => void verifyOtpThenNext()} disabled={loading}>{text.verifyOtp}</Button>
                  </div>
                </>
              )}

              {emailStep === "password" && (
                <form className="space-y-3" onSubmit={finalizeByOtp}>
                  <Input type="password" placeholder={text.newPassword} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  <Button className="w-full" disabled={loading}>
                    {loading ? <span className="inline-flex items-center gap-2"><Spinner />...</span> : text.saveAndLogin}
                  </Button>
                </form>
              )}
            </div>
          )}

          {method === "pin" && (
            <form className="space-y-3" onSubmit={resetByPin}>
              <Input type="email" placeholder={text.emailPlaceholder} value={pinEmail} onChange={(e) => setPinEmail(e.target.value)} required />
              <Input type="password" inputMode="numeric" maxLength={6} placeholder={text.pinPlaceholder} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
              <Input type="password" placeholder={text.newPassword} value={pinNewPassword} onChange={(e) => setPinNewPassword(e.target.value)} required />
              <Button className="w-full" disabled={loading}>
                {loading ? <span className="inline-flex items-center gap-2"><Spinner />...</span> : text.saveAndLogin}
              </Button>
            </form>
          )}
        </Card>
      </main>
    </MobileShell>
  );
}

