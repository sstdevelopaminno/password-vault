"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";
import {
  compareReleaseByCodeOrVersion,
  getDefaultAndroidReleasePayload,
  type AndroidApkCompatibility,
  type AndroidApkRelease,
} from "@/lib/android-apk-release";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import { installAndroidApkUpdate } from "@/lib/vault-shield";

type AndroidReleaseApiPayload = {
  ok?: boolean;
  release?: AndroidApkRelease;
  compatibility?: AndroidApkCompatibility;
};

const ANDROID_PWA_PROMPT_SEEN_PREFIX = "pv_android_pwa_prompt_seen_";
const FORCE_ANDROID_INSTALL_POPUP_EVENT = "pv:force-android-install-popup";

function defaultRelease() {
  const fallback = getDefaultAndroidReleasePayload();
  return { release: fallback.release, compatibility: fallback.compatibility };
}

async function fetchReleaseFromApi() {
  try {
    const response = await fetch("/api/android-release", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as AndroidReleaseApiPayload;
    if (!response.ok || !body.release || !body.compatibility) {
      return defaultRelease();
    }
    return { release: body.release, compatibility: body.compatibility };
  } catch {
    return defaultRelease();
  }
}

function parseVersionCode(input: unknown) {
  const numeric = Number(String(input ?? "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

export function AndroidApkUpdatePopup() {
  const { locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installedVersionName, setInstalledVersionName] = useState(APP_VERSION);
  const [installedVersionCode, setInstalledVersionCode] = useState<number | null>(null);
  const [release, setRelease] = useState<AndroidApkRelease>(() => defaultRelease().release);
  const [compatibility, setCompatibility] = useState<AndroidApkCompatibility>(() => defaultRelease().compatibility);

  const capabilities = detectRuntimeCapabilities();
  const isAndroidRuntime = capabilities.isAndroid && !capabilities.isIos;
  const isAndroidWebRuntime = isAndroidRuntime && !capabilities.isCapacitorNative;

  const popupEligible = useMemo(() => isAndroidRuntime, [isAndroidRuntime]);

  const dismissPopup = () => {
    if (typeof window !== "undefined" && isAndroidWebRuntime) {
      window.localStorage.setItem(ANDROID_PWA_PROMPT_SEEN_PREFIX + release.versionName, "1");
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!popupEligible || typeof window === "undefined") return;

    let mounted = true;

    const refreshPopupState = async () => {
      const payload = await fetchReleaseFromApi();

      let detectedInstalledVersionName = APP_VERSION;
      let detectedInstalledVersionCode: number | null = null;

      if (capabilities.isCapacitorNative) {
        try {
          const { App } = await import("@capacitor/app");
          const info = await App.getInfo();
          const nativeVersion = String(info.version ?? "").trim();
          if (nativeVersion) detectedInstalledVersionName = nativeVersion;
          detectedInstalledVersionCode = parseVersionCode(info.build);
        } catch {
          // ignore
        }
      }

      if (!mounted) return;

      setRelease(payload.release);
      setCompatibility(payload.compatibility);
      setInstalledVersionName(detectedInstalledVersionName);
      setInstalledVersionCode(detectedInstalledVersionCode);

      if (isAndroidWebRuntime) {
        const seen = window.localStorage.getItem(ANDROID_PWA_PROMPT_SEEN_PREFIX + payload.release.versionName) === "1";
        setOpen(!seen);
        return;
      }

      const compareResult = compareReleaseByCodeOrVersion({
        installedVersionName: detectedInstalledVersionName,
        installedVersionCode: detectedInstalledVersionCode,
        releaseVersionName: payload.release.versionName,
        releaseVersionCode: payload.release.versionCode,
      });
      setOpen(compareResult < 0);
    };

    void refreshPopupState();

    const timer = setInterval(() => {
      void refreshPopupState();
    }, 120000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refreshPopupState();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [capabilities.isCapacitorNative, isAndroidWebRuntime, popupEligible]);

  useEffect(() => {
    if (!popupEligible || typeof window === "undefined") return;

    const forceOpen = () => {
      setOpen(true);
    };

    window.addEventListener(FORCE_ANDROID_INSTALL_POPUP_EVENT, forceOpen);
    return () => {
      window.removeEventListener(FORCE_ANDROID_INSTALL_POPUP_EVENT, forceOpen);
    };
  }, [popupEligible]);

  if (!popupEligible || !open) return null;

  const title = isAndroidWebRuntime
    ? locale === "th"
      ? "แนะนำติดตั้งแอป Android บนเครื่องนี้"
      : "Recommended: install Android app on this device"
    : locale === "th"
      ? "ติดตั้งแอป Android เวอร์ชันล่าสุด"
      : "Install the latest Android app";

  const detail = isAndroidWebRuntime
    ? locale === "th"
      ? `คุณกำลังใช้งานผ่าน PWA ฟีเจอร์โทร/รายชื่อจะเสถียรกว่าเมื่อใช้แอป Android เวอร์ชัน ${release.versionName}`
      : `You are running in PWA mode. Calling/contacts are more stable in Android app ${release.versionName}.`
    : locale === "th"
      ? `พร้อมอัปเดตเป็นเวอร์ชัน ${release.versionName} (${release.versionCode})`
      : `Version ${release.versionName} (${release.versionCode}) is ready to install.`;

  const compatibilityText = compatibility.canInstallOverExisting
    ? locale === "th"
      ? "ตรวจสอบแล้ว: package/signing key ตรงกัน ติดตั้งทับได้"
      : "Verified: package/signing key match. In-place install is supported."
    : locale === "th"
      ? "พบ package/signing key ต่างกัน ควรถอนแอปเดิมก่อนติดตั้งใหม่"
      : "Package/signing mismatch detected. Reinstall may be required.";

  const installClick = async () => {
    if (installing || !release.downloadUrl) return;

    setInstalling(true);
    if (capabilities.isCapacitorNative) {
      const result = await installAndroidApkUpdate({
        downloadUrl: release.downloadUrl,
        title: locale === "th" ? `Vault อัปเดต ${release.versionName}` : `Vault update ${release.versionName}`,
        description: locale === "th" ? "กำลังดาวน์โหลดแพ็กเกจอัปเดต" : "Downloading update package",
        fileName: `vault-v${release.versionName}.apk`,
      });

      setInstalling(false);
      if (!result) {
        toast.showToast(locale === "th" ? "เริ่มติดตั้งแบบ native ไม่สำเร็จ จะเปิดลิงก์ดาวน์โหลดแทน" : "Native install failed, opening download link.", "error");
        dismissPopup();
        window.location.assign(release.downloadUrl);
        return;
      }

      if (result.status === "permission_required") {
        toast.showToast(locale === "th" ? "กรุณาอนุญาตติดตั้งแอปที่ไม่รู้จัก แล้วกดอีกครั้ง" : "Please allow install unknown apps, then try again.", "error");
        return;
      }

      dismissPopup();
      toast.showToast(locale === "th" ? "เริ่มดาวน์โหลดแล้ว ระบบจะเปิดหน้าติดตั้งอัตโนมัติ" : "Download started. Installer will open automatically.", "success");
      return;
    }

    setInstalling(false);
    dismissPopup();
    window.location.assign(release.downloadUrl);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={locale === "th" ? "ปิด" : "Close"}
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]"
        onClick={dismissPopup}
      />

      <div className="relative z-10 w-[min(92vw,430px)] rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <button
          type="button"
          aria-label={locale === "th" ? "ปิด" : "Close"}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={dismissPopup}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="inline-flex rounded-2xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 p-2.5 text-white shadow-[0_10px_24px_rgba(59,130,246,0.35)]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3">
          <p className="text-xs font-semibold text-slate-700">{locale === "th" ? "แพ็กเกจติดตั้งล่าสุด" : "Latest build package"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{release.packageName} | {release.publishedAt}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {locale === "th"
              ? `เวอร์ชันที่เครื่องนี้กำลังรัน: ${installedVersionName}${installedVersionCode ? ` (${installedVersionCode})` : ""}`
              : `Current running version: ${installedVersionName}${installedVersionCode ? ` (${installedVersionCode})` : ""}`}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">
          <p className="inline-flex items-center gap-1 font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            {locale === "th" ? "สถานะความเข้ากันได้" : "Compatibility"}
          </p>
          <p className="mt-1">{compatibilityText}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" disabled={installing} onClick={dismissPopup}>
            {locale === "th" ? "ภายหลัง" : "Later"}
          </Button>
          <Button type="button" onClick={() => void installClick()} disabled={installing || !release.downloadUrl}>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              {installing ? (locale === "th" ? "กำลังเริ่ม..." : "Starting...") : locale === "th" ? "ติดตั้งตอนนี้" : "Install now"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
