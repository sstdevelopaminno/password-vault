"use client";

import { RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useOutageState } from "@/lib/outage-detector";

export function OfflineBanner() {
  const { locale } = useI18n();
  const { isOfflineMode, online, apiReachable, autoSync } = useOutageState();
  const isThai = locale === "th";

  if (!isOfflineMode && !autoSync.syncing) return null;

  const message = isOfflineMode
    ? !online
      ? isThai
        ? "ออฟไลน์: ระบบกำลังใช้ข้อมูลในเครื่องชั่วคราว"
        : "Offline: using local data temporarily"
      : !apiReachable
        ? isThai
          ? "เซิร์ฟเวอร์/ฐานข้อมูลไม่พร้อม: เปิดโหมดสำรองอัตโนมัติ"
          : "Server/DB unavailable: fallback mode active"
        : isThai
          ? "โหมดสำรองกำลังทำงาน"
          : "Fallback mode is active"
    : isThai
      ? "กำลังกู้คืนระบบและซิงก์ข้อมูลอัตโนมัติ..."
      : "Recovering and auto-syncing queued data...";

  return (
    <div className="sticky top-0 z-40 px-4 pt-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm">
        <p className="inline-flex items-center gap-2">
          {autoSync.syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
          {message}
        </p>
      </div>
    </div>
  );
}
