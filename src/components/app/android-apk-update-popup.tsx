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

function defaultRelease(): { release: AndroidApkRelease; compatibility: AndroidApkCompatibility } {
  const fallback = getDefaultAndroidReleasePayload();
  return { release: fallback.release, compatibility: fallback.compatibility };
}

async function fetchReleaseFromApi() {
  try {
    const response = await fetch("/api/android-release", { cache: "no-store" });
    const body = (await response.json().catch(function () {
      return {};
    })) as AndroidReleaseApiPayload;

    if (!response.ok || !body.release || !body.compatibility) {
      return defaultRelease();
    }

    return {
      release: body.release,
      compatibility: body.compatibility,
    };
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
  const recommendedAndroidMajor = 10;
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installedVersionName, setInstalledVersionName] = useState(APP_VERSION);
  const [installedVersionCode, setInstalledVersionCode] = useState<number | null>(null);
  const [release, setRelease] = useState<AndroidApkRelease>(() => defaultRelease().release);
  const [compatibility, setCompatibility] = useState<AndroidApkCompatibility>(() => defaultRelease().compatibility);
  const capabilities = detectRuntimeCapabilities();

  const popupEligible = useMemo(function isPopupEligible() {
    return capabilities.isAndroid && !capabilities.isIos;
  }, [capabilities.isAndroid, capabilities.isIos]);

  useEffect(
    function loadAndroidReleasePopupState() {
      if (!popupEligible || typeof window === "undefined") return;

      let mounted = true;
      let removeResumeListener: null | (() => void) = null;
      let refreshTimer: null | ReturnType<typeof setInterval> = null;

      const refreshPopupState = async () => {
        const payload = await fetchReleaseFromApi();
        let detectedInstalledVersionName = APP_VERSION;
        let detectedInstalledVersionCode: number | null = null;

        if (capabilities.isCapacitorNative) {
          try {
            const { App } = await import("@capacitor/app");
            const info = await App.getInfo();
            const nativeVersion = String(info.version ?? "").trim();
            if (nativeVersion) {
              detectedInstalledVersionName = nativeVersion;
            }
            detectedInstalledVersionCode = parseVersionCode(info.build);
          } catch {
            // fallback to web runtime marker
          }
        }

        if (!mounted) return;
        const compareResult = compareReleaseByCodeOrVersion({
          installedVersionName: detectedInstalledVersionName,
          installedVersionCode: detectedInstalledVersionCode,
          releaseVersionName: payload.release.versionName,
          releaseVersionCode: payload.release.versionCode,
        });

        setRelease(payload.release);
        setCompatibility(payload.compatibility);
        setInstalledVersionName(detectedInstalledVersionName);
        setInstalledVersionCode(detectedInstalledVersionCode);
        setOpen(compareResult < 0);
      };

      void refreshPopupState();
      refreshTimer = setInterval(function periodicRefresh() {
        void refreshPopupState();
      }, 120000);

      const onVisibilityChange = function onVisibilityChange() {
        if (document.visibilityState !== "visible") return;
        void refreshPopupState();
      };

      document.addEventListener("visibilitychange", onVisibilityChange);

      if (capabilities.isCapacitorNative) {
        void import("@capacitor/app")
          .then(async function ({ App }) {
            const handle = await App.addListener("resume", function () {
              void refreshPopupState();
            });
            if (!mounted) {
              void handle.remove();
              return;
            }
            removeResumeListener = function () {
              void handle.remove();
            };
          })
          .catch(function () {
            // ignore listener setup failure
          });
      }

      return function cleanup() {
        mounted = false;
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (removeResumeListener) {
          removeResumeListener();
        }
        if (refreshTimer) {
          clearInterval(refreshTimer);
        }
      };
    },
    [capabilities.isCapacitorNative, popupEligible],
  );

  if (!popupEligible || !open) return null;

  const title = locale === "th" ? "ติดตั้งแอป Android เวอร์ชันล่าสุด" : "Install the latest Android app";
  const detail =
    locale === "th"
      ? `พร้อมอัปเดตเป็นเวอร์ชัน ${release.versionName} (versionCode ${release.versionCode})`
      : `Version ${release.versionName} (versionCode ${release.versionCode}) is ready to install.`;

  const compatibilityText = compatibility.canInstallOverExisting
    ? locale === "th"
      ? "ตรวจสอบแล้ว: package และ signing key ตรงกัน สามารถอัปเดตทับแอปเดิมได้ทันที"
      : "Verified: package and signing key match. You can install over the existing app."
    : locale === "th"
      ? "พบความต่างของ package/signing key ควรถอนเวอร์ชันเดิมก่อนติดตั้งใหม่"
      : "Package/signing mismatch detected. Uninstall old app before reinstalling.";

  const installClick = async function installClick() {
    if (installing) return;
    if (!release.downloadUrl) {
      toast.showToast(
        locale === "th" ? "ยังไม่ได้ตั้งค่าลิงก์ดาวน์โหลด APK" : "APK download URL is not configured yet.",
        "error",
      );
      return;
    }

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
        toast.showToast(
          locale === "th"
            ? "เริ่มตัวติดตั้งแบบ native ไม่สำเร็จ กำลังเปิดลิงก์ดาวน์โหลดแทน"
            : "Unable to start native installer flow. Opening download link instead.",
          "error",
        );
        setOpen(false);
        window.location.assign(release.downloadUrl);
        return;
      }

      if (result.status === "permission_required") {
        toast.showToast(
          locale === "th"
            ? "กรุณาอนุญาต 'ติดตั้งแอปที่ไม่รู้จัก' แล้วกดอัปเดตอีกครั้ง"
            : "Please allow install unknown apps for this app, then tap update again.",
          "error",
        );
        return;
      }

      setOpen(false);
      toast.showToast(
        locale === "th"
          ? "เริ่มดาวน์โหลดแล้ว ระบบจะเปิดหน้าติดตั้งให้อัตโนมัติหลังดาวน์โหลดเสร็จ"
          : "Download started. Installer will open automatically after download completes.",
        "success",
      );
      return;
    }

    setOpen(false);
    setInstalling(false);
    window.location.assign(release.downloadUrl);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={locale === "th" ? "ปิด" : "Close"}
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]"
        onClick={function closePopup() {
          setOpen(false);
        }}
      />

      <div className="relative z-10 w-[min(92vw,430px)] rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <button
          type="button"
          aria-label={locale === "th" ? "ปิด" : "Close"}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={function closePopup() {
            setOpen(false);
          }}
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
          <p className="text-xs font-semibold text-slate-700">
            {locale === "th" ? "แพ็กเกจติดตั้งล่าสุด" : "Latest build package"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {release.packageName} | {release.publishedAt}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {locale === "th"
              ? `เวอร์ชันที่ติดตั้งปัจจุบัน: ${installedVersionName}${installedVersionCode ? ` (${installedVersionCode})` : ""}`
              : `Installed version: ${installedVersionName}${installedVersionCode ? ` (${installedVersionCode})` : ""}`}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-700">
            <span className="font-semibold">
              {locale === "th" ? "สถานะอัปเดตทับ: " : "In-place upgrade: "}
            </span>
            {compatibility.canInstallOverExisting
              ? locale === "th"
                ? "รองรับ"
                : "supported"
              : locale === "th"
                ? "ต้องติดตั้งใหม่"
                : "reinstall required"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            {locale === "th"
              ? `รองรับตั้งแต่ Android 7.0+ (API 24), แนะนำ Android ${recommendedAndroidMajor}+ เพื่อความเสถียรสูง`
              : `Supports Android 7.0+ (API 24), Android ${recommendedAndroidMajor}+ recommended for high stability.`}
          </p>
          {typeof capabilities.androidMajorVersion === "number" && capabilities.androidMajorVersion < recommendedAndroidMajor ? (
            <p className="mt-1 text-xs leading-5 text-amber-700">
              {locale === "th"
                ? `เครื่องนี้เป็น Android ${capabilities.androidMajorVersion}; อาจมีข้อจำกัดบางส่วน`
                : `This device is Android ${capabilities.androidMajorVersion}; some limitations may apply.`}
            </p>
          ) : null}
        </div>

        <div
          className={
            "mt-3 rounded-2xl px-3 py-3 text-xs leading-5 " +
            (compatibility.canInstallOverExisting
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border border-amber-200 bg-amber-50 text-amber-900")
          }
        >
          <p className="inline-flex items-center gap-1 font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            {locale === "th" ? "ตรวจสอบความเข้ากันได้ก่อนติดตั้ง" : "Compatibility pre-check"}
          </p>
          <p className="mt-1">{compatibilityText}</p>
        </div>

        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
          {locale === "th"
            ? "หมายเหตุ: Android ต้องให้ผู้ใช้ยืนยันหน้าติดตั้งเองตามนโยบายความปลอดภัยของระบบ"
            : "Note: Android requires user confirmation on the installer screen for security."}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={installing}
            onClick={function laterClick() {
              setOpen(false);
            }}
          >
            {locale === "th" ? "ภายหลัง" : "Later"}
          </Button>

          <Button type="button" onClick={() => void installClick()} disabled={installing}>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              {installing
                ? (locale === "th" ? "กำลังเริ่มติดตั้ง..." : "Starting installer...")
                : locale === "th"
                  ? "อัปเดตแบบคลิกเดียว"
                  : "One-tap update"}
            </span>
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-2 h-10 w-full rounded-xl"
          onClick={() => {
            if (!release.downloadUrl) return;
            window.location.assign(release.downloadUrl);
          }}
          disabled={!release.downloadUrl || installing}
        >
          {locale === "th" ? "ดาวน์โหลดไฟล์ APK" : "Download APK file"}
        </Button>
      </div>
    </div>
  );
}
