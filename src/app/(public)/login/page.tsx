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
  retryAfterSec?: number;
};

const LOGIN_TIMEOUT_MS = 12_000;
const LOGIN_RETRY_DELAY_MS = 350;

function mapLoginError(input: {
  message: unknown;
  fallback: string;
  locale: "th" | "en";
  retryAfterSec?: number;
}) {
  const text = String(input.message ?? "");
  const lower = text.toLowerCase();
  const locale = input.locale;

  if (lower.includes("account is disabled")) {
    return locale === "th"
      ? "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ"
      : "This account is disabled. Please contact an administrator.";
  }

  if (lower.includes("profile mismatch")) {
    return locale === "th"
      ? "ตรวจพบข้อมูลบัญชีไม่ตรงกัน ระบบกำลังซ่อมแซมอัตโนมัติ กรุณาลองอีกครั้ง"
      : "Account profile mismatch detected. Please retry shortly.";
  }

  if (lower.includes("unable to secure this login session")) {
    return locale === "th"
      ? "ไม่สามารถยืนยันความปลอดภัยของเซสชันได้ กรุณาเข้าสู่ระบบใหม่"
      : "Unable to secure this login session. Please sign in again.";
  }

  if (lower.includes("too many login attempts") || lower.includes("please wait") || lower.includes("rate")) {
    const retry = Number(input.retryAfterSec ?? 0);
    if (Number.isFinite(retry) && retry > 0) {
      return locale === "th"
        ? `ลองใหม่อีกครั้งใน ${retry} วินาที`
        : `Please retry in ${retry} seconds.`;
    }
    return locale === "th"
      ? "พยายามเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่"
      : "Too many attempts. Please wait a moment.";
  }

  if (lower.includes("invalid login credentials")) {
    return locale === "th"
      ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      : "Invalid email or password.";
  }

  if (lower.includes("email not confirmed")) {
    return locale === "th"
      ? "ยังไม่ยืนยันอีเมล กรุณายืนยัน OTP ก่อนเข้าสู่ระบบ"
      : "Email not confirmed. Please verify OTP first.";
  }

  if (text) return text;
  return input.fallback;
}

function wait(ms: number) {
  return new Promise<void>(function (resolve) {
    window.setTimeout(resolve, ms);
  });
}

function shouldRetryLoginStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function requestLoginWithResilience(payload: { email: string; password: string }): Promise<{
  response: Response | null;
  body: LoginResponse;
}> {
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(function () {
      controller.abort();
    }, LOGIN_TIMEOUT_MS);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      window.clearTimeout(timer);
      const body = (await response.json().catch(function () {
        return {};
      })) as LoginResponse;

      if (attempt === 0 && shouldRetryLoginStatus(response.status)) {
        await wait(LOGIN_RETRY_DELAY_MS);
        continue;
      }

      return { response, body };
    } catch (error) {
      window.clearTimeout(timer);
      lastNetworkError = error;
      if (attempt === 0) {
        await wait(LOGIN_RETRY_DELAY_MS);
      }
    }
  }

  const fallbackError =
    lastNetworkError instanceof DOMException && lastNetworkError.name === "AbortError"
      ? "Request timeout. Please retry."
      : "Network unavailable. Please retry.";
  return {
    response: null,
    body: { error: fallbackError },
  };
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

    const result = await requestLoginWithResilience({
      email: email.trim().toLowerCase(),
      password,
    });

    if (!result.response) {
      showToast(
        mapLoginError({
          message: result.body.error,
          locale,
          fallback: locale === "th" ? "เครือข่ายไม่เสถียร กรุณาลองอีกครั้ง" : "Network unstable. Please retry.",
        }),
        "error",
      );
      setLoading(false);
      return;
    }

    const response = result.response;
    const body = result.body;

    if (!response.ok) {
      const errorText = String(body.error ?? "");
      showToast(
        mapLoginError({
          message: body.error,
          retryAfterSec: body.retryAfterSec,
          locale,
          fallback: t("login.failed"),
        }),
        "error",
      );

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
      setLoading(false);
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

    setLoading(false);
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
