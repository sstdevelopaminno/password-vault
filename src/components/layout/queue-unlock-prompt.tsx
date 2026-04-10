"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { setOfflineEncryptionPassphrase } from "@/lib/offline-store";
import { flushOfflineQueue, getOfflineQueueSummary } from "@/lib/offline-sync";
import { useOutageState } from "@/lib/outage-detector";

type QueueSummary = Awaited<ReturnType<typeof getOfflineQueueSummary>>;

const DEFAULT_SUMMARY: QueueSummary = {
  total: 0,
  unlocked: 0,
  locked: 0,
};

export function QueueUnlockPrompt() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const { isOfflineMode } = useOutageState();
  const [summary, setSummary] = useState<QueueSummary>(DEFAULT_SUMMARY);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const isThai = locale === "th";

  const refreshSummary = useCallback(async function () {
    const next = await getOfflineQueueSummary();
    setSummary(next);
  }, []);

  useEffect(
    function () {
      const bootstrapId = window.setTimeout(function () {
        void refreshSummary();
      }, 0);
      const intervalId = window.setInterval(function () {
        void refreshSummary();
      }, 15000);
      const onVisibilityChange = function () {
        if (!document.hidden) {
          void refreshSummary();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      return function () {
        window.clearTimeout(bootstrapId);
        window.clearInterval(intervalId);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
    [refreshSummary],
  );

  async function handleUnlock() {
    const sanitized = pin.replace(/\D/g, "").slice(0, 6);
    if (sanitized.length !== 6) {
      showToast(isThai ? "กรุณากรอก PIN 6 หลัก" : "Please enter a 6-digit PIN", "error");
      return;
    }
    setBusy(true);
    setOfflineEncryptionPassphrase(sanitized);
    const next = await getOfflineQueueSummary();
    setSummary(next);

    if (next.locked > 0) {
      setBusy(false);
      showToast(isThai ? "PIN ไม่ถูกต้อง หรือยังปลดล็อกไม่ได้" : "Invalid PIN or unable to unlock queued data", "error");
      return;
    }

    setPin("");
    showToast(isThai ? "ปลดล็อกคิวสำเร็จ" : "Queue unlocked", "success");
    if (!isOfflineMode && next.total > 0) {
      const result = await flushOfflineQueue();
      if (result.processed > 0 || result.failed > 0) {
        showToast(
          isThai
            ? `ซิงก์อัตโนมัติสำเร็จ ${result.processed} รายการ, ล้มเหลว ${result.failed}`
            : `Auto-sync processed ${result.processed}, failed ${result.failed}`,
          result.failed > 0 ? "error" : "success",
        );
      }
      await refreshSummary();
    }
    setBusy(false);
  }

  if (summary.locked <= 0) return null;

  return (
    <div className="px-4 pt-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 shadow-sm">
        <p className="inline-flex items-center gap-2 text-xs font-semibold">
          <LockKeyhole className="h-4 w-4" />
          {isThai ? "พบข้อมูลออฟไลน์ที่ถูกล็อก" : "Locked offline data detected"}
        </p>
        <p className="mt-1 text-xs leading-5">
          {isThai
            ? `มี ${summary.locked} รายการที่ต้องใส่ PIN เพื่อปลดล็อกก่อนซิงก์`
            : `${summary.locked} queued item(s) require PIN unlock before sync`}
        </p>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={isThai ? "PIN 6 หลัก" : "6-digit PIN"}
          />
          <Button type="button" variant="secondary" className="h-12 rounded-xl" onClick={() => void handleUnlock()} disabled={busy}>
            <RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />
            {isThai ? "ปลดล็อก" : "Unlock"}
          </Button>
        </div>
      </div>
    </div>
  );
}
