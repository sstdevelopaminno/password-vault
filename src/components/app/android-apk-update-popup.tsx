"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import {
  ANDROID_APK_PROMPT_SEEN_KEY,
  ANDROID_APK_PROMPT_SNOOZE_KEY,
  compareReleaseVersion,
  getDefaultAndroidReleasePayload,
  type AndroidApkCompatibility,
  type AndroidApkRelease,
} from "@/lib/android-apk-release";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";

type AndroidReleaseApiPayload = {
  ok?: boolean;
  release?: AndroidApkRelease;
  compatibility?: AndroidApkCompatibility;
};

const POPUP_SNOOZE_MS = 6 * 60 * 60 * 1000;

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

export function AndroidApkUpdatePopup() {
  const { locale } = useI18n();
  const toast = useToast();
  const recommendedAndroidMajor = 10;
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState<AndroidApkRelease>(() => defaultRelease().release);
  const [compatibility, setCompatibility] = useState<AndroidApkCompatibility>(() => defaultRelease().compatibility);
  const capabilities = detectRuntimeCapabilities();

  const popupEligible = useMemo(function isPopupEligible() {
    return capabilities.isAndroid && !capabilities.isIos && !capabilities.isCapacitorNative;
  }, [capabilities.isAndroid, capabilities.isCapacitorNative, capabilities.isIos]);

  useEffect(function loadAndroidReleasePopupState() {
    if (!popupEligible || typeof window === "undefined") return;

    let mounted = true;
    void fetchReleaseFromApi().then(function (payload) {
      if (!mounted) return;
      setRelease(payload.release);
      setCompatibility(payload.compatibility);

      const snoozeUntil = Number(window.localStorage.getItem(ANDROID_APK_PROMPT_SNOOZE_KEY) ?? "0");
      if (Number.isFinite(snoozeUntil) && snoozeUntil > Date.now()) {
        setOpen(false);
        return;
      }

      const seenVersion = String(window.localStorage.getItem(ANDROID_APK_PROMPT_SEEN_KEY) ?? "").trim();
      if (seenVersion && compareReleaseVersion(seenVersion, payload.release.versionName) >= 0) {
        setOpen(false);
        return;
      }

      setOpen(true);
    });

    return function cleanup() {
      mounted = false;
    };
  }, [popupEligible]);

  if (!popupEligible || !open) return null;

  const title = locale === "th" ? "ติดตั้งแอป Android เวอร์ชันล่าสุด" : "Install the latest Android app";
  const detail =
    locale === "th"
      ? `พร้อมดาวน์โหลดเวอร์ชัน ${release.versionName} (versionCode ${release.versionCode})`
      : `Version ${release.versionName} (versionCode ${release.versionCode}) is ready to install.`;

  const compatibilityText = compatibility.canInstallOverExisting
    ? locale === "th"
      ? "ตรวจสอบแล้ว: package name และ signing key ตรงกัน สามารถกดอัปเดตทับแอปเดิมได้ทันที"
      : "Verified: package name and signing key match. You can install over the existing app."
    : locale === "th"
      ? "พบความต่างของ package/signing key ควรถอนการติดตั้งเวอร์ชันเดิมก่อนลงใหม่"
      : "Package/signing mismatch detected. Uninstall old app before reinstalling.";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={locale === "th" ? "ปิด" : "Close"}
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]"
        onClick={function closePopup() {
          const nextSnooze = Date.now() + POPUP_SNOOZE_MS;
          window.localStorage.setItem(ANDROID_APK_PROMPT_SNOOZE_KEY, String(nextSnooze));
          setOpen(false);
        }}
      />

      <div className="relative z-10 w-[min(92vw,430px)] rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <button
          type="button"
          aria-label={locale === "th" ? "ปิด" : "Close"}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={function closePopup() {
            const nextSnooze = Date.now() + POPUP_SNOOZE_MS;
            window.localStorage.setItem(ANDROID_APK_PROMPT_SNOOZE_KEY, String(nextSnooze));
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
            {locale === "th" ? "ไฟล์ติดตั้งล่าสุด" : "Latest build package"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {release.packageName} • {release.publishedAt}
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
              ? `รองรับตั้งแต่ Android 7.0+ (API 24) • แนะนำ Android ${recommendedAndroidMajor}+ เพื่อความเสถียรสูง`
              : `Supports Android 7.0+ (API 24) • Android ${recommendedAndroidMajor}+ recommended for high stability`}
          </p>
          {typeof capabilities.androidMajorVersion === "number" && capabilities.androidMajorVersion < recommendedAndroidMajor ? (
            <p className="mt-1 text-xs leading-5 text-amber-700">
              {locale === "th"
                ? `เครื่องนี้เป็น Android ${capabilities.androidMajorVersion} อาจมีข้อจำกัดบางส่วน แนะนำอัปเดตระบบ`
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={function laterClick() {
              const nextSnooze = Date.now() + POPUP_SNOOZE_MS;
              window.localStorage.setItem(ANDROID_APK_PROMPT_SNOOZE_KEY, String(nextSnooze));
              setOpen(false);
            }}
          >
            {locale === "th" ? "ภายหลัง" : "Later"}
          </Button>

          <Button
            type="button"
            onClick={function installClick() {
              if (!release.downloadUrl) {
                toast.showToast(
                  locale === "th"
                    ? "ยังไม่ได้ตั้งค่าลิงก์ดาวน์โหลด APK"
                    : "APK download URL is not configured yet.",
                  "error",
                );
                return;
              }

              window.localStorage.setItem(ANDROID_APK_PROMPT_SEEN_KEY, release.versionName);
              window.localStorage.removeItem(ANDROID_APK_PROMPT_SNOOZE_KEY);
              setOpen(false);
              window.location.assign(release.downloadUrl);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              {locale === "th" ? "ดาวน์โหลดและติดตั้ง" : "Download & install"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
