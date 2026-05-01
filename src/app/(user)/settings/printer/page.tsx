"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bluetooth, CheckCircle2, ChevronLeft, Printer, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import {
  canUseNativePrinter,
  listNativePrinters,
  loadSelectedNativePrinter,
  printEscPosTest80mm,
  saveSelectedNativePrinter,
  type SavedNativePrinter,
} from "@/lib/native-thermal-printer";

type PrinterItem = {
  id: string;
  name: string;
};

export default function PrinterSettingsPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const isThai = locale === "th";

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [devices, setDevices] = useState<PrinterItem[]>([]);
  const [selected, setSelected] = useState<SavedNativePrinter | null>(null);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [testPrintCompleted, setTestPrintCompleted] = useState(false);
  const nativeReady = useMemo(() => canUseNativePrinter(), []);

  const smokePass = nativeReady && scanCompleted && Boolean(selected) && testPrintCompleted;

  const loadDevices = useCallback(async () => {
    if (!nativeReady) {
      setDevices([]);
      setScanCompleted(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listNativePrinters("bluetooth");
      setDevices(rows.map((row) => ({ id: row.id, name: row.name })));
      setScanCompleted(rows.length > 0);
      if (rows.length === 0) {
        showToast(isThai ? "ไม่พบเครื่องพิมพ์ใกล้เคียง" : "No nearby printer found.", "error");
      }
    } catch (error) {
      setScanCompleted(false);
      showToast(error instanceof Error ? error.message : (isThai ? "ค้นหาเครื่องพิมพ์ไม่สำเร็จ" : "Unable to scan bluetooth printers."), "error");
    } finally {
      setLoading(false);
    }
  }, [isThai, nativeReady, showToast]);

  useEffect(() => {
    const saved = loadSelectedNativePrinter();
    setSelected(saved);
    void loadDevices();
  }, [loadDevices]);

  function connectDevice(device: PrinterItem) {
    const next: SavedNativePrinter = {
      type: "bluetooth",
      id: device.id,
      name: device.name,
    };
    saveSelectedNativePrinter(next);
    setSelected(next);
    showToast(isThai ? "ตั้งค่าเครื่องพิมพ์เริ่มต้นแล้ว" : "Default printer set.", "success");
  }

  function disconnectDevice() {
    saveSelectedNativePrinter(null);
    setSelected(null);
    setTestPrintCompleted(false);
    showToast(isThai ? "ยกเลิกการเชื่อมต่อแล้ว" : "Printer disconnected.", "success");
  }

  async function runTestPrint() {
    if (!selected) {
      showToast(isThai ? "กรุณาเลือกเครื่องพิมพ์ก่อน" : "Please select a printer first.", "error");
      return;
    }
    setTesting(true);
    try {
      await printEscPosTest80mm({ printer: selected, sellerName: isThai ? "ระบบออกบิล" : "Billing System" });
      setTestPrintCompleted(true);
      showToast(isThai ? "ทดสอบพิมพ์สำเร็จ" : "Test print success.", "success");
    } catch (error) {
      setTestPrintCompleted(false);
      showToast(error instanceof Error ? error.message : (isThai ? "ทดสอบพิมพ์ไม่สำเร็จ" : "Test print failed."), "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+10px)]">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-app-h2 font-semibold text-slate-100">{isThai ? "เครื่องพิมพ์ Bluetooth" : "Bluetooth Printer"}</h1>
      </div>

      <Card className="space-y-3 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-app-body font-semibold text-slate-100">{isThai ? "ค้นหาและเชื่อมต่อเครื่องพิมพ์" : "Scan and connect printer"}</p>
          <Button type="button" variant="secondary" className="h-9 gap-2" onClick={() => void loadDevices()} disabled={loading}>
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
            {isThai ? "ค้นหา" : "Scan"}
          </Button>
        </div>

        {!nativeReady ? (
          <div className="rounded-xl border border-amber-300/45 bg-amber-500/15 px-3 py-2 text-app-caption text-amber-100">
            {isThai ? "เมนูนี้ใช้ได้เฉพาะ Android APK เท่านั้น" : "This menu is available only in Android native APK runtime."}
          </div>
        ) : null}

        {nativeReady && devices.length === 0 && !loading ? (
          <div className="rounded-xl border border-slate-500/45 bg-slate-600/20 px-3 py-2 text-app-caption text-slate-200">
            {isThai ? "ไม่พบเครื่องพิมพ์ Bluetooth ใกล้เคียง" : "No nearby bluetooth printer found."}
          </div>
        ) : null}

        {nativeReady && devices.length > 0 ? (
          <div className="space-y-2">
            {devices.map((device) => {
              const active = selected?.id === device.id && selected?.type === "bluetooth";
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => connectDevice(device)}
                  className={
                    "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition " +
                    (active
                      ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-100"
                      : "border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-100 hover:border-[var(--border-strong)]")
                  }
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Bluetooth className="h-4 w-4 shrink-0" />
                    <span className="truncate text-app-body">{device.name}</span>
                  </span>
                  {active ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="h-10 gap-2" onClick={() => void runTestPrint()} disabled={!nativeReady || !selected || testing}>
            <Printer className="h-4 w-4" />
            {testing ? (isThai ? "กำลังพิมพ์..." : "Printing...") : (isThai ? "ทดสอบพิมพ์" : "Test print")}
          </Button>
          <Button type="button" variant="secondary" className="h-10 gap-2" onClick={disconnectDevice} disabled={!selected}>
            <XCircle className="h-4 w-4" />
            {isThai ? "ยกเลิกเชื่อมต่อ" : "Disconnect"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-2 rounded-[20px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
        <p className="text-app-body font-semibold text-slate-100">{isThai ? "ตรวจสอบครบ 3 ขั้นตอน" : "3-step smoke checklist"}</p>
        <p className="text-app-caption text-slate-300">{isThai ? "1) สแกน 2) เลือกเป็นค่าเริ่มต้น 3) ทดสอบพิมพ์" : "1) Scan 2) Set default 3) Test print"}</p>
        <div className="space-y-1 text-app-caption">
          <p className={scanCompleted ? "text-emerald-200" : "text-slate-300"}>{scanCompleted ? "?" : "	"} {isThai ? "สแกนเครื่องพิมพ์" : "Scan printers"}</p>
          <p className={selected ? "text-emerald-200" : "text-slate-300"}>{selected ? "?" : "	"} {isThai ? "ตั้งค่าเครื่องพิมพ์เริ่มต้น" : "Set default printer"}</p>
          <p className={testPrintCompleted ? "text-emerald-200" : "text-slate-300"}>{testPrintCompleted ? "?" : "	"} {isThai ? "ทดสอบพิมพ์สำเร็จ" : "Test print passed"}</p>
        </div>
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2 text-app-caption text-slate-200">
          {smokePass
            ? (isThai ? "พร้อมใช้งาน: เมนูพิมพ์ในแอปจะใช้เครื่องนี้อัตโนมัติ" : "Ready: print menus now use this printer automatically.")
            : (isThai ? "ยังไม่ครบขั้นตอน กรุณาทำตามลำดับ 1 > 2 > 3" : "Not completed yet. Follow steps 1 > 2 > 3.")}
        </div>
      </Card>
    </section>
  );
}
