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
        ? "เธญเธญเธเนเธฅเธเน: เธฃเธฐเธเธเธเธณเธฅเธฑเธเนเธเนเธเนเธญเธกเธนเธฅเนเธเน€เธเธฃเธทเนเธญเธเธเธฑเนเธงเธเธฃเธฒเธง"
        : "Offline: using local data temporarily"
      : !apiReachable
        ? isThai
          ? "เน€เธเธดเธฃเนเธเน€เธงเธญเธฃเน/เธเธฒเธเธเนเธญเธกเธนเธฅเนเธกเนเธเธฃเนเธญเธก: เน€เธเธดเธ”เนเธซเธกเธ”เธชเธณเธฃเธญเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธด"
          : "Server/DB unavailable: fallback mode active"
        : isThai
          ? "เนเธซเธกเธ”เธชเธณเธฃเธญเธเธเธณเธฅเธฑเธเธ—เธณเธเธฒเธ"
          : "Fallback mode is active"
    : isThai
      ? "เธเธณเธฅเธฑเธเธเธนเนเธเธทเธเธฃเธฐเธเธเนเธฅเธฐเธเธดเธเธเนเธเนเธญเธกเธนเธฅเธญเธฑเธ•เนเธเธกเธฑเธ•เธด..."
      : "Recovering and auto-syncing queued data...";

  return (
    <div className="sticky top-0 z-40 px-4 pt-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-app-caption font-medium text-amber-800 shadow-sm">
        <p className="inline-flex items-center gap-2">
          {autoSync.syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
          {message}
        </p>
      </div>
    </div>
  );
}

