"use client";

import { useMemo } from "react";
import { Download, Smartphone } from "lucide-react";
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
      ? `เธ”เธฒเธงเธเนเนเธซเธฅเธ”เนเธฅเธฐเธ•เธดเธ”เธ•เธฑเนเธ APK Android v${DEFAULT_ANDROID_APK_RELEASE.versionName}`
      : `Download Android APK v${DEFAULT_ANDROID_APK_RELEASE.versionName}`;

  return (
    <div className={`flex flex-col items-start gap-1.5 ${className}`.trim()}>
      <Button
        type="button"
        variant="secondary"
        className="h-10 rounded-xl border border-sky-200 bg-white/85 px-3 text-app-caption font-semibold text-slate-700 shadow-[0_8px_20px_rgba(30,64,175,0.12)] hover:bg-sky-50"
        onClick={function handleDownloadClick() {
          if (!DEFAULT_ANDROID_APK_RELEASE.downloadUrl) {
            toast.showToast(
              locale === "th"
                ? "เธขเธฑเธเนเธกเนเนเธ”เนเธ•เธฑเนเธเธเนเธฒเธฅเธดเธเธเนเธ”เธฒเธงเธเนเนเธซเธฅเธ” APK"
                : "APK download URL is not configured yet.",
              "error",
            );
            return;
          }

          window.location.assign(DEFAULT_ANDROID_APK_RELEASE.downloadUrl);
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Smartphone className="h-3.5 w-3.5" />
          <Download className="h-3.5 w-3.5" />
          {buttonLabel}
        </span>
      </Button>

      <p className="text-app-micro text-slate-500">
        {locale === "th"
          ? `package: ${DEFAULT_ANDROID_APK_RELEASE.packageName} โ€ข เธฃเธญเธเธฃเธฑเธเธเธฒเธฃเธ•เธดเธ”เธ•เธฑเนเธเธ—เธฑเธเนเธญเธเน€เธ”เธดเธก`
          : `package: ${DEFAULT_ANDROID_APK_RELEASE.packageName} โ€ข supports in-place upgrade`}
      </p>
      <p className="text-app-micro text-slate-500">
        {locale === "th"
          ? `เธฃเธญเธเธฃเธฑเธ Android 7.0+ (API 24) โ€ข เนเธเธฐเธเธณ Android ${recommendedAndroidMajor}+ เน€เธเธทเนเธญเธเธงเธฒเธกเน€เธชเธ–เธตเธขเธฃเธชเธนเธ`
          : `Supports Android 7.0+ (API 24) โ€ข Android ${recommendedAndroidMajor}+ recommended for high stability`}
      </p>
      {typeof capabilities.androidMajorVersion === "number" && capabilities.androidMajorVersion < recommendedAndroidMajor ? (
        <p className="text-app-micro text-amber-700">
          {locale === "th"
            ? `เธญเธธเธเธเธฃเธ“เนเธเธตเนเน€เธเนเธ Android ${capabilities.androidMajorVersion} เธญเธฒเธเธกเธตเธเนเธญเธเธณเธเธฑเธ”เธเธฒเธเธชเนเธงเธ เนเธเธฐเธเธณเธญเธฑเธเน€เธ”เธ•เน€เธเนเธ Android ${recommendedAndroidMajor}+`
            : `This device is Android ${capabilities.androidMajorVersion}; some limitations may apply. Android ${recommendedAndroidMajor}+ is recommended.`}
        </p>
      ) : null}
    </div>
  );
}

