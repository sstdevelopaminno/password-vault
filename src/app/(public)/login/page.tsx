"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/client";
import { detectRuntimeCapabilities, getRuntimeModeLabel } from "@/lib/pwa-runtime";
import type { RuntimePlatformMode } from "@/lib/pwa-runtime";
import {
  getNativeOAuthRedirectUrl,
  getWebOAuthRedirectUrl,
  mapNativeCallbackToWebPath,
} from "@/lib/sso";
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

type AndroidReleaseResponse = {
  ok?: boolean;
  release?: {
    versionName?: string;
  };
};

const LOGIN_TIMEOUT_MS = 12_000;
const LOGIN_RETRY_DELAY_MS = 350;
const GOOGLE_SSO_ENABLED = String(process.env.NEXT_PUBLIC_AUTH_SSO_GOOGLE_ENABLED ?? "true").trim() !== "false";

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<RuntimePlatformMode>("browser-tab");
  const [latestApkVersion, setLatestApkVersion] = useState("");

  const flowNotes = [t("register.createdPending")];

  useEffect(() => {
    const runtime = detectRuntimeCapabilities();
    setRuntimeMode(runtime.mode);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/android-release", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async function (response) {
        const body = (await response.json().catch(function () {
          return {};
        })) as AndroidReleaseResponse;

        const version = String(body.release?.versionName ?? "").trim();
        if (response.ok && version) {
          setLatestApkVersion(version);
        }
      })
      .catch(function () {
        // ignore silent diagnostics in login footer
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const restoreExistingSession = async (attempt: number) => {
      try {
        const response = await fetch("/api/profile/me", { cache: "no-store" });
        const body = (await response.json().catch(function () {
          return {};
        })) as {
          recoverable?: boolean;
        };

        if (disposed) {
          return;
        }

        if (response.ok) {
          router.replace("/home");
          return;
        }

        const isRecoverable = response.status === 503 || Boolean(body.recoverable);
        if (isRecoverable && attempt < 5) {
          window.setTimeout(function () {
            void restoreExistingSession(attempt + 1);
          }, 500 * (attempt + 1));
        }
      } catch {
        // ignore bootstrap session probe errors on login screen
      }
    };

    void restoreExistingSession(0);

    return () => {
      disposed = true;
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const runtime = detectRuntimeCapabilities();
    if (!runtime.isCapacitorNative) return;

    let removeListener: null | (() => void) = null;

    const setupNativeSsoListener = async () => {
      try {
        const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
        const handle = await App.addListener("appUrlOpen", (event) => {
          const targetPath = mapNativeCallbackToWebPath(String(event.url ?? ""), window.location.origin);
          if (!targetPath) return;

          void Browser.close().catch(() => {});
          router.replace(targetPath);
        });

        removeListener = () => {
          void handle.remove();
        };
      } catch (nativeError) {
        console.error("Failed to initialize native OAuth listener:", nativeError);
      }
    };

    void setupNativeSsoListener();

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [router]);

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
          ? "ยินดีต้อนรับกลับสู่ Vault"
          : "Welcome back to Vault.",
      href: "/home",
      alsoSystem: true,
    });

    setLoading(false);
    router.replace("/home");
  }

  async function signInWithGoogle() {
    if (loading || googleLoading) {
      return;
    }

    setGoogleLoading(true);

    try {
      const supabase = createClient();
      const runtime = detectRuntimeCapabilities();
      const options = runtime.isCapacitorNative
        ? { redirectTo: getNativeOAuthRedirectUrl(), skipBrowserRedirect: true as const, queryParams: { prompt: "select_account" } }
        : { redirectTo: getWebOAuthRedirectUrl(window.location.origin), skipBrowserRedirect: true as const, queryParams: { prompt: "select_account" } };

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options,
      });

      if (error || !data?.url) {
        throw new Error(error?.message || "Unable to start Google sign-in.");
      }

      if (runtime.isCapacitorNative) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
        return;
      }

      window.location.assign(data.url);
    } catch (error) {
      showToast(
        mapLoginError({
          message: error instanceof Error ? error.message : "Unable to start Google sign-in.",
          locale,
          fallback: t("login.failed"),
        }),
        "error",
      );
    } finally {
      setGoogleLoading(false);
    }
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
          <div className="absolute -top-20 -left-20 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="absolute top-2 right-[-80px] h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute bottom-[-160px] left-1/2 h-[25rem] w-[25rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <Card className="w-full space-y-4 animate-slide-up rounded-[30px] border border-[rgba(124,145,220,0.34)] bg-[linear-gradient(180deg,rgba(8,16,40,0.94),rgba(5,11,30,0.98))]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="neon-icon-wrap rounded-2xl p-3 text-[#6fdaff]">
                <ShieldCheck className="h-6 w-6" />
              </div>

              <div>
                <p className="text-[24px] font-semibold leading-tight text-[#f3f8ff]">{t("common.appName")}</p>
                <p className="text-sm text-[#95abd7]">{t("landing.subtitle")}</p>
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-[#f3f8ff]">{t("login.title")}</h1>
              <p className="text-xs text-[#8ea3cf]">
                {locale === "th"
                  ? `โหมด: ${getRuntimeModeLabel(runtimeMode, locale)} | แอป ${APP_VERSION}${latestApkVersion ? ` | APK ล่าสุด ${latestApkVersion}` : ""}`
                  : `Mode: ${getRuntimeModeLabel(runtimeMode, locale)} | App ${APP_VERSION}${latestApkVersion ? ` | Latest APK ${latestApkVersion}` : ""}`}
              </p>
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
              <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(9,16,38,0.92),rgba(7,12,30,0.96))] px-3 font-medium text-[#cfe0ff] transition hover:border-[var(--border-strong)] hover:text-white" href="/forgot-password">
                {t("login.forgotPassword")}
              </Link>

              <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--grad-main)] px-3 font-semibold text-white shadow-[0_10px_20px_rgba(79,123,255,0.25)] transition hover:brightness-105" href="/register">
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

            {GOOGLE_SSO_ENABLED ? (
              <Button
                className="w-full"
                type="button"
                variant="secondary"
                disabled={loading || googleLoading}
                onClick={() => void signInWithGoogle()}
              >
                {googleLoading ? "Connecting Google..." : "Continue with Google"}
              </Button>
            ) : null}
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
