"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { consumeReminderQuota } from "@/lib/install-reminder";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import {
  installAndroidApkUpdate,
  onVaultShieldApkInstallState,
  openPendingAndroidApkInstaller,
  readVaultShieldDeviceSecurityState,
} from "@/lib/vault-shield";

type AndroidReleaseApiPayload = {
  ok?: boolean;
  release?: AndroidApkRelease;
  compatibility?: AndroidApkCompatibility;
};

export const FORCE_ANDROID_INSTALL_POPUP_EVENT = "pv:force-android-install-popup";
const PWA_INSTALL_REMINDER_KEY = "pv_pwa_install_reminder_v1";
const PWA_INSTALL_REMINDER_MAX_PER_DAY = 2;
const PWA_INSTALL_REMINDER_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

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
  const [waitingInstallPermission, setWaitingInstallPermission] = useState(false);
  const [pendingInstallerAvailable, setPendingInstallerAvailable] = useState(false);
  const waitingInstallPermissionRef = useRef(false);
  const releaseRef = useRef(release);
  const openRef = useRef(open);

  const capabilities = detectRuntimeCapabilities();
  const isAndroidRuntime = capabilities.isAndroid && !capabilities.isIos;
  const isAndroidWebRuntime = isAndroidRuntime && !capabilities.isCapacitorNative;

  const popupEligible = useMemo(() => isAndroidRuntime, [isAndroidRuntime]);

  useEffect(() => {
    releaseRef.current = release;
  }, [release]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    waitingInstallPermissionRef.current = waitingInstallPermission;
  }, [waitingInstallPermission]);

  const dismissPopup = () => {
    setWaitingInstallPermission(false);
    setPendingInstallerAvailable(false);
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
        if (openRef.current) {
          setOpen(true);
          return;
        }

        const quotaGranted = consumeReminderQuota({
          storageKey: PWA_INSTALL_REMINDER_KEY,
          maxPerDay: PWA_INSTALL_REMINDER_MAX_PER_DAY,
          minIntervalMs: PWA_INSTALL_REMINDER_MIN_INTERVAL_MS,
        });
        setOpen(quotaGranted);
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

  useEffect(() => {
    if (!capabilities.isCapacitorNative || !isAndroidRuntime) return;

    let mounted = true;
    let removeListener: (() => Promise<void>) | null = null;

    void onVaultShieldApkInstallState((event) => {
      if (!mounted) return;

      if (event.status === "installer_opened") {
        setPendingInstallerAvailable(false);
        setWaitingInstallPermission(false);
        setOpen(false);
        toast.showToast(locale === "th" ? "เปิดหน้าติดตั้งแล้ว" : "Installer opened.", "success");
        return;
      }

      if (event.status === "installer_blocked" || event.status === "installer_error" || event.status === "download_failed") {
        setOpen(true);
        setPendingInstallerAvailable(true);
        toast.showToast(
          locale === "th"
            ? "ระบบบล็อกการเปิดติดตั้งอัตโนมัติ กรุณากดปุ่มเปิดตัวติดตั้ง"
            : "Auto-open installer was blocked. Please tap Open installer.",
          "error",
        );
      }
    }).then((remove) => {
      removeListener = remove;
    });

    return () => {
      mounted = false;
      if (removeListener) {
        void removeListener();
      }
    };
  }, [capabilities.isCapacitorNative, isAndroidRuntime, locale, toast]);

  const startNativeInstall = useCallback(async (targetRelease: AndroidApkRelease) => {
    const result = await installAndroidApkUpdate({
      downloadUrl: targetRelease.downloadUrl,
      title: locale === "th" ? `Vault อัปเดต ${targetRelease.versionName}` : `Vault update ${targetRelease.versionName}`,
      description: locale === "th" ? "กำลังดาวน์โหลดแพ็กเกจอัปเดต" : "Downloading update package",
      fileName: `vault-v${targetRelease.versionName}.apk`,
    });

    if (!result) {
      toast.showToast(locale === "th" ? "เริ่มติดตั้งแบบ native ไม่สำเร็จ จะเปิดลิงก์ดาวน์โหลดแทน" : "Native install failed, opening download link.", "error");
      setWaitingInstallPermission(false);
      setPendingInstallerAvailable(false);
      setOpen(false);
      window.location.assign(targetRelease.downloadUrl);
      return;
    }

    if (result.status === "permission_required") {
      setWaitingInstallPermission(true);
      toast.showToast(
        locale === "th"
          ? "กรุณาอนุญาตติดตั้งแอปที่ไม่รู้จัก แล้วกลับมาที่แอป ระบบจะลองต่อให้อัตโนมัติ"
          : "Please allow install unknown apps, then return to the app. Installation will resume automatically.",
        "error",
      );
      return;
    }

    setWaitingInstallPermission(false);
    if (result.status === "downloading") {
      setPendingInstallerAvailable(false);
      toast.showToast(
        locale === "th"
          ? "เริ่มดาวน์โหลดแล้ว ระบบจะเปิดหน้าติดตั้งอัตโนมัติ หากไม่เด้งให้กดปุ่มเปิดตัวติดตั้ง"
          : "Download started. Installer opens automatically; if blocked, tap Open installer.",
        "success",
      );
      return;
    }

    if (result.status === "installer_blocked") {
      setOpen(true);
      setPendingInstallerAvailable(true);
      toast.showToast(
        locale === "th"
          ? "ระบบผู้ผลิตบล็อกการเปิดติดตั้งอัตโนมัติ กดปุ่มเปิดตัวติดตั้งเพื่อดำเนินการต่อ"
          : "Installer auto-open was blocked by device policy. Tap Open installer to continue.",
        "error",
      );
      return;
    }
  }, [locale, toast]);

  useEffect(() => {
    if (!capabilities.isCapacitorNative || !isAndroidRuntime || typeof window === "undefined") return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!waitingInstallPermissionRef.current) return;

      void readVaultShieldDeviceSecurityState().then((state) => {
        if (!state?.unknownSourcesEnabled) return;
        const pendingRelease = releaseRef.current;
        if (!pendingRelease?.downloadUrl) return;

        setWaitingInstallPermission(false);
        setInstalling(true);
        void startNativeInstall(pendingRelease).finally(() => setInstalling(false));
      });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [capabilities.isCapacitorNative, isAndroidRuntime, startNativeInstall]);

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
      ? `คุณกำลังใช้งานผ่าน PWA แนะนำติดตั้งแอป Android เวอร์ชัน ${release.versionName} เพื่อประสิทธิภาพและความเสถียรที่ดีกว่า`
      : `You are running in PWA mode. Install Android app ${release.versionName} for better performance and stability.`
    : locale === "th"
      ? `พร้อมดาวน์โหลดและติดตั้งเวอร์ชัน ${release.versionName} (${release.versionCode})`
      : `Version ${release.versionName} (${release.versionCode}) is ready to download and install.`;

  const compatibilityText = compatibility.canInstallOverExisting
    ? locale === "th"
      ? "ตรวจสอบแล้ว: package/signing key ตรงกัน ติดตั้งทับได้"
      : "Verified: package/signing key match. In-place install is supported."
    : locale === "th"
      ? "พบ package/signing key ต่างกัน ควรถอนแอปเดิมก่อนติดตั้งใหม่"
      : "Package/signing mismatch detected. Reinstall may be required.";

  const installPolicyHint = locale === "th"
    ? "ระบบจะดาวน์โหลด APK และเปิดหน้าติดตั้งให้อัตโนมัติ เมื่อระบบถามยืนยันการติดตั้ง โปรดกดยืนยันบนเครื่อง"
    : "The app will download APK and open the installer automatically. Confirm installation on your device when prompted.";

  const installClick = async () => {
    if (installing) return;

    setInstalling(true);
    if (!release.downloadUrl) {
      setInstalling(false);
      return;
    }

    if (capabilities.isCapacitorNative) {
      await startNativeInstall(release);
      setInstalling(false);
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

      <div className="relative z-10 w-[min(92vw,430px)] rounded-3xl border border-[rgba(120,146,230,0.4)] bg-[linear-gradient(180deg,rgba(8,16,40,0.98),rgba(6,12,34,0.98))] p-4 text-slate-100 shadow-[0_24px_70px_rgba(15,23,42,0.4)]">
        <button
          type="button"
          aria-label={locale === "th" ? "ปิด" : "Close"}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
          onClick={dismissPopup}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="inline-flex rounded-2xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 p-2.5 text-white shadow-[0_10px_24px_rgba(59,130,246,0.35)]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold text-slate-100">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[rgba(116,145,226,0.38)] bg-[rgba(14,26,62,0.82)] px-3 py-3">
          <p className="text-xs font-semibold text-slate-100">{locale === "th" ? "แพ็กเกจติดตั้งล่าสุด" : "Latest build package"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{release.packageName} | {release.publishedAt}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {locale === "th"
              ? `เวอร์ชันที่เครื่องนี้กำลังรัน: ${installedVersionName}${installedVersionCode ? ` (${installedVersionCode})` : ""}`
              : `Current running version: ${installedVersionName}${installedVersionCode ? ` (${installedVersionCode})` : ""}`}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-emerald-300/35 bg-emerald-500/12 px-3 py-3 text-xs text-emerald-100">
          <p className="inline-flex items-center gap-1 font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            {locale === "th" ? "สถานะความเข้ากันได้" : "Compatibility"}
          </p>
          <p className="mt-1">{compatibilityText}</p>
        </div>

        <p className="mt-2 text-[11px] leading-5 text-slate-300">{installPolicyHint}</p>

        {waitingInstallPermission ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {locale === "th"
              ? "กำลังรอสิทธิ์ Install unknown apps เมื่อกลับจากหน้าตั้งค่า ระบบจะพยายามดาวน์โหลดต่อให้อัตโนมัติ"
              : "Waiting for Install unknown apps permission. Update will resume automatically after returning from settings."}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" disabled={installing} onClick={dismissPopup}>
            {locale === "th" ? "ภายหลัง" : "Later"}
          </Button>
          <Button type="button" onClick={() => void installClick()} disabled={installing || !release.downloadUrl}>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              {installing
                ? (locale === "th" ? "กำลังเปิด..." : "Opening...")
                : locale === "th"
                  ? "ดาวน์โหลดและติดตั้ง"
                  : "Download & install"}
            </span>
          </Button>
        </div>

        {pendingInstallerAvailable ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              void openPendingAndroidApkInstaller().then((result) => {
                if (result?.status === "installer_opened") {
                  setPendingInstallerAvailable(false);
                  setOpen(false);
                  toast.showToast(locale === "th" ? "เปิดตัวติดตั้งแล้ว" : "Installer opened.", "success");
                  return;
                }

                toast.showToast(
                  locale === "th"
                    ? "ระบบยังบล็อกการเปิดอัตโนมัติ ให้เปิดจาก Downloads ในเครื่อง"
                    : "Installer is still blocked. Please open the APK from Downloads.",
                  "error",
                );
              });
            }}
          >
            {locale === "th" ? "เปิดตัวติดตั้ง" : "Open installer"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
