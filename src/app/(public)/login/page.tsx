"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

function mapLoginError(message: unknown, locale: "th" | "en", fallback: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return locale === "th"
      ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่"
      : "Invalid email or password. Please try again.";
  }

  if (lower.includes("email not confirmed")) {
    return locale === "th"
      ? "อีเมลยังไม่ยืนยัน กรุณาตรวจสอบอีเมลของคุณ"
      : "Email is not confirmed yet. Please check your inbox.";
  }

  if (lower.includes("account is disabled")) {
 return locale === "th"
 ? "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแล"
 : "This account is disabled. Please contact admin.";
 }

 if (lower.includes("account is not approved yet")) {
    return locale === "th"
      ? "บัญชียังไม่เปิดใช้งาน กรุณายืนยัน OTP หรือติดต่อผู้ดูแล"
      : "Account is not active yet. Please verify OTP or contact admin.";
  }

  if (lower.includes("too many login attempts") || lower.includes("rate")) {
    return locale === "th"
      ? "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"
      : "Too many login attempts. Please wait and retry.";
  }

  return text || fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const logoUrl =
    "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/Imagemaster%20password.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0ltYWdlbWFzdGVyIHBhc3N3b3JkLnBuZyIsImlhdCI6MTc3NDY4ODA1OCwiZXhwIjoxODA2MjI0MDU4fQ.__nNJXjVLblbj_cp2avV446S6XgN-W1ECwPTl_sSxtU";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const timeout = new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error("REQUEST_TIMEOUT"));
        }, 12000);
      });
      const res = (await Promise.race([
        fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
        timeout,
      ])) as Response;

      const body = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        showToast(mapLoginError((body as { error?: string }).error, locale, t("login.failed")), "error");
        return;
      }

      if ((body as { needsOtpVerification?: boolean }).needsOtpVerification) {
 showToast(
 locale === "th"
 ? "บัญชียังไม่ยืนยัน OTP กรุณายืนยันก่อนเข้าใช้งาน"
 : "Your account is pending OTP verification. Please verify first.",
 "error",
 );
 router.push(`/verify-otp?email=${encodeURIComponent(email.trim().toLowerCase())}`);
 return;
 }

 if ((body as { pendingApproval?: boolean }).pendingApproval) {
 showToast(
 locale === "th"
 ? "บัญชีอยู่ระหว่างรออนุมัติ ระบบจะอนุมัติอัตโนมัติภายใน 1-2 นาที"
 : "Account is pending approval. Auto-approval should complete within 1-2 minutes.",
 "success",
 );
 }

 setLoading(false);
 router.push("/home");
    } catch {
      showToast(locale === "th" ? "เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง" : "Network error. Please try again.", "error");
      setLoading(false);
    }
  }

  return (
    <MobileShell>
      <main className="flex flex-1 items-center px-5 py-8">
        <Card className="w-full space-y-4">
          <div className="space-y-3 text-center">
            <img
              src={logoUrl}
              alt="Master Password Logo"
              className="mx-auto h-24 w-24 rounded-2xl object-cover shadow-[0_12px_28px_rgba(79,123,255,0.28)]"
              loading="lazy"
            />
            <h1 className="text-xl font-semibold">{t("login.title")}</h1>
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            <Input
              type="email"
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button className="w-full" disabled={loading}>
              {loading ? t("login.signingIn") : t("login.signIn")}
            </Button>
          </form>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <a
              href="/forgot-password"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 font-semibold text-blue-700 transition hover:border-[var(--border-strong)] hover:bg-white"
            >
              {t("login.forgotPassword").replace(/\?/g, "")}
            </a>
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-[#43d8ff] via-[#4f7bff] to-[#d946ef] px-3 font-semibold text-white shadow-[0_8px_18px_rgba(79,123,255,0.3)] transition hover:brightness-110"
            >
              {t("login.register")}
            </button>
          </div>
        </Card>
      </main>

      {showTerms ? (
        <div className="fixed inset-0 z-50 bg-slate-950/55 p-4 backdrop-blur-[2px]" onClick={() => setShowTerms(false)}>
          <div className="mx-auto mt-10 w-full max-w-[560px]" onClick={(e) => e.stopPropagation()}>
            <Card className="space-y-4 rounded-[24px] border border-[var(--border-strong)] bg-white p-5 text-slate-900">
              <h2 className="text-xl font-semibold">ข้อตกลงการใช้งานระบบจัดเก็บรหัส</h2>
              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-sm leading-7 text-slate-700">
                <div>
                  <p className="font-semibold">1. การยินยอมของผู้ใช้งาน</p>
                  <p>ผู้สมัครหรือผู้ใช้งานตกลงและยินยอมให้ข้อมูลที่เกี่ยวข้องกับบัญชีและรหัสผ่านถูกจัดเก็บภายในระบบ เพื่อวัตถุประสงค์ในการให้บริการตามที่กำหนด</p>
                </div>
                <div>
                  <p className="font-semibold">2. ความรับผิดชอบของผู้ใช้งาน</p>
                  <p>ผู้ใช้งานมีหน้าที่ดูแลรักษาข้อมูลบัญชีและการเข้าถึงของตนเองให้ปลอดภัย และต้องไม่เปิดเผยข้อมูลแก่บุคคลอื่นโดยไม่ได้รับอนุญาต</p>
                </div>
                <div>
                  <p className="font-semibold">3. ข้อจำกัดความรับผิดของผู้ให้บริการ</p>
                  <p>ทางผู้ให้บริการจะไม่รับผิดชอบต่อความเสียหาย ความสูญเสีย หรือปัญหาใด ๆ ที่เกิดจากการใช้งานของผู้ใช้งานเอง การละเมิดความปลอดภัยจากฝั่งผู้ใช้งาน หรือเหตุการณ์ที่อยู่นอกเหนือการควบคุมของระบบ</p>
                </div>
                <div>
                  <p className="font-semibold">4. มาตรการความปลอดภัยของระบบ</p>
                  <p>ระบบของเราได้รับการออกแบบให้มีมาตรการป้องกันและรักษาความปลอดภัยในระดับสูง เพื่อปกป้องข้อมูลของผู้ใช้งาน อย่างไรก็ตาม ไม่มีระบบใดที่สามารถรับประกันความปลอดภัยได้ 100%</p>
                </div>
                <div>
                  <p className="font-semibold">5. การยอมรับเงื่อนไข</p>
                  <p>การสมัครใช้งานหรือการใช้งานระบบ ถือว่าผู้ใช้งานได้อ่าน ทำความเข้าใจ และยอมรับข้อตกลงทั้งหมดนี้โดยสมบูรณ์</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setShowTerms(false)}>
                  ไม่ยอมรับ
                </Button>
                <Button
                  onClick={() => {
                    setShowTerms(false);
                    router.push("/register");
                  }}
                >
                  ยอมรับและไปสมัคร
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </MobileShell>
  );
}







