"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { useHeadsUpNotifications } from "@/components/notifications/heads-up-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

type LoginResponse = {
  error?: string;
  needsOtpVerification?: boolean;
  pendingApproval?: boolean;
  autoApproved?: boolean;
};

function mapLoginError(message: unknown, fallback: string) {
  const text = String(message ?? "");
  const lower = text.toLowerCase();
  if (lower.includes("invalid login credentials")) return fallback;
  if (lower.includes("too many login attempts")) return fallback;
  if (lower.includes("please wait")) return fallback;
  if (lower.includes("rate")) return fallback;
  if (lower.includes("account is disabled")) return fallback;
  if (text) return text;
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const { notify } = useHeadsUpNotifications();
  const { showToast } = useToast();
  const { t, locale } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const flowNotes = [t("register.createdPending")];

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as LoginResponse;
    setLoading(false);

    if (!response.ok) {
      const errorText = String(body.error ?? "");
      showToast(mapLoginError(body.error, t("login.failed")), "error");

      if (response.status === 429 || errorText.toLowerCase().includes("too many login attempts")) {
        notify({
          kind: "security",
          title: locale === "th" ? "ตรวจพบความเสี่ยงด้านความปลอดภัย" : "Security risk detected",
          message:
            locale === "th"
              ? "มีการพยายามเข้าสู่ระบบถี่ผิดปกติ ระบบจำกัดการเข้าชั่วคราว"
              : "Unusual repeated sign-in attempts detected. Access was temporarily rate-limited.",
          details:
            locale === "th"
              ? "หากไม่ใช่คุณ แนะนำเปลี่ยนรหัสผ่านทันที"
              : "If this wasn't you, change your password immediately.",
          href: "/forgot-password",
          persistent: true,
          alsoSystem: true,
        });
      }
      return;
    }

    notify({
      kind: "auth",
      title: locale === "th" ? "เข้าสู่ระบบสำเร็จ" : "Login successful",
      message:
        locale === "th"
          ? "ยินดีต้อนรับกลับสู่ Password Vault"
          : "Welcome back to Password Vault.",
      href: "/home",
      alsoSystem: true,
    });

    router.push("/home");
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value);
  }

  return (
    <MobileShell>
      <main className="relative flex flex-1 items-center px-5 py-8">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(224,244,255,0.78)_0%,rgba(223,227,246,0.9)_44%,rgba(234,236,243,1)_100%)]" />
          <div className="absolute -top-16 -left-20 h-72 w-72 rounded-full bg-cyan-200/55 blur-3xl" />
          <div className="absolute top-0 right-[-80px] h-80 w-80 rounded-full bg-fuchsia-300/35 blur-3xl" />
          <div className="absolute -top-6 left-1/2 h-[18rem] w-[155%] -translate-x-1/2 rounded-b-[55%] bg-gradient-to-b from-white/40 via-white/22 to-transparent" />
        </div>

        <Card className="w-full space-y-4 animate-slide-up">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                <ShieldCheck className="h-6 w-6" />
              </div>

              <div>
                <p className="text-[24px] font-semibold leading-tight text-slate-800">{t("common.appName")}</p>
                <p className="text-sm text-slate-500">{t("landing.subtitle")}</p>
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{t("login.title")}</h1>
            </div>
          </div>

          <form className="space-y-3" onSubmit={signIn}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("login.email")}
              value={email}
              onChange={handleEmailChange}
              required
            />

            <Input
              type="password"
              autoComplete="current-password"
              placeholder={t("login.password")}
              value={password}
              onChange={handlePasswordChange}
              required
            />

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 font-medium text-slate-600 transition hover:border-[var(--border-strong)] hover:bg-white hover:text-slate-800" href="/forgot-password">
                {t("login.forgotPassword")}
              </Link>

              <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 px-3 font-semibold text-white shadow-[0_10px_20px_rgba(79,123,255,0.25)] transition hover:brightness-105" href="/register">
                {t("login.register")}
              </Link>
            </div>

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {t("login.signingIn")}
                </span>
              ) : (
                t("login.signIn")
              )}
            </Button>
          </form>

          <div className="hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-4 text-sm text-slate-600">
            <ul className="mt-2 space-y-2">
              {flowNotes.map((note) => (
                <li key={note} className="leading-6">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </main>
    </MobileShell>
  );
}
