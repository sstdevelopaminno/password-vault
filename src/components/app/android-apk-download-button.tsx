"use client";

import { useMemo } from "react";
import { Download, Smartphone } from "lucide-react";
import { FORCE_ANDROID_INSTALL_POPUP_EVENT } from "@/components/app/android-apk-update-popup";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { DEFAULT_ANDROID_APK_RELEASE } from "@/lib/android-apk-release";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";

type AndroidApkDownloadButtonProps = {
  className?: string;
};

export function AndroidApkDownloadButton({ className = "" }: AndroidApkDownloadButtonProps) {
  const { locale } = useI18n();
  const toast = useToast();
  const capabilities = detectRuntimeCapabilities();
  const recommendedAndroidMajor = 10;

  const visible = useMemo(function shouldShowButton() {
    return capabilities.isAndroid && !capabilities.isIos && !capabilities.isCapacitorNative;
  }, [capabilities.isAndroid, capabilities.isCapacitorNative, capabilities.isIos]);

  if (!visible) return null;

  const buttonLabel =
    locale === "th"
      ? `ดาวน์โหลด APK Android v${DEFAULT_ANDROID_APK_RELEASE.versionName}`
      : `Download Android APK v${DEFAULT_ANDROID_APK_RELEASE.versionName}`;

  return (
    <div className={`flex w-full flex-col items-start gap-1.5 ${className}`.trim()}>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="h-10 rounded-xl px-3 text-[12px] font-semibold"
          onClick={function handlePopupClick() {
            window.dispatchEvent(new Event(FORCE_ANDROID_INSTALL_POPUP_EVENT));
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5" />
            {locale === "th" ? "เปิดหน้าติดตั้ง" : "Open install popup"}
          </span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-10 rounded-xl px-3 text-[12px] font-semibold"
          onClick={function handleDownloadClick() {
            if (!DEFAULT_ANDROID_APK_RELEASE.downloadUrl) {
              toast.showToast(
                locale === "th" ? "ยังไม่ได้ตั้งค่าลิงก์ดาวน์โหลด APK" : "APK download URL is not configured yet.",
                "error",
              );
              return;
            }

            window.location.assign(DEFAULT_ANDROID_APK_RELEASE.downloadUrl);
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Download className="h-3.5 w-3.5" />
            {buttonLabel}
          </span>
        </Button>
      </div>

      <p className="text-[11px] text-slate-500">
        {locale === "th"
          ? `package: ${DEFAULT_ANDROID_APK_RELEASE.packageName} รองรับการติดตั้งทับแอปเดิม`
          : `package: ${DEFAULT_ANDROID_APK_RELEASE.packageName} supports in-place upgrade`}
      </p>
      <p className="text-[11px] text-slate-500">
        {locale === "th"
          ? `รองรับ Android 7.0+ (API 24) และแนะนำ Android ${recommendedAndroidMajor}+ เพื่อความเสถียรสูง`
          : `Supports Android 7.0+ (API 24), with Android ${recommendedAndroidMajor}+ recommended for high stability`}
      </p>
      {typeof capabilities.androidMajorVersion === "number" && capabilities.androidMajorVersion < recommendedAndroidMajor ? (
        <p className="text-[11px] text-amber-700">
          {locale === "th"
            ? `อุปกรณ์นี้เป็น Android ${capabilities.androidMajorVersion} อาจมีข้อจำกัดบางส่วน แนะนำอัปเดตเป็น Android ${recommendedAndroidMajor}+`
            : `This device is Android ${capabilities.androidMajorVersion}; some limitations may apply. Android ${recommendedAndroidMajor}+ is recommended.`}
        </p>
      ) : null}
    </div>
  );
}
