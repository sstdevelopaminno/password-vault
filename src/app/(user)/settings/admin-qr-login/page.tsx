"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, QrCode, RefreshCw, ShieldCheck, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { isAdminQrPayloadExpired, parseAdminQrPayload, type AdminQrPayload } from "@/lib/admin-qr-login";

type AccessState = "loading" | "allowed" | "forbidden";

export default function AdminQrLoginPage() {
  const { locale } = useI18n();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<import("qr-scanner").default | null>(null);

  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [role, setRole] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [rawPayload, setRawPayload] = useState("");
  const [manualPayload, setManualPayload] = useState("");
  const [challenge, setChallenge] = useState<AdminQrPayload | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const expiresInSeconds = useMemo(() => {
    if (!challenge) return 0;
    const remain = Date.parse(challenge.expiresAt) - Date.now();
    return Math.max(0, Math.floor(remain / 1000));
  }, [challenge]);

  async function loadProfile() {
    const response = await fetch("/api/profile/me", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as {
      role?: string;
      status?: string;
    };

    if (!response.ok) {
      setAccessState("forbidden");
      return;
    }

    const nextRole = String(body.role ?? "");
    const nextStatus = String(body.status ?? "");
    const allowed = nextStatus === "active" && ["admin", "super_admin"].includes(nextRole);

    setRole(nextRole || "user");
    setAccessState(allowed ? "allowed" : "forbidden");
  }

  async function stopScanner() {
    if (!scannerRef.current) {
      setIsScanning(false);
      return;
    }

    try {
      await scannerRef.current.stop();
    } catch {
      // ignore scanner stop race condition
    }

    scannerRef.current.destroy();
    scannerRef.current = null;
    setIsScanning(false);
  }

  async function handleScannedPayload(raw: string) {
    const trimmed = raw.trim();
    const parsed = parseAdminQrPayload(trimmed);

    if (!parsed.ok) {
      setScanError(parsed.error);
      setScanMessage(null);
      return;
    }

    if (isAdminQrPayloadExpired(parsed.payload)) {
      setScanError(locale === "th" ? "QR หมดอายุแล้ว กรุณาสร้างใหม่จากหน้าล็อกอินแอดมิน" : "QR challenge has expired. Please generate a new one.");
      setScanMessage(null);
      return;
    }

    setRawPayload(trimmed);
    setManualPayload(trimmed);
    setChallenge(parsed.payload);
    setScanError(null);
    setScanMessage(locale === "th" ? "สแกนสำเร็จ ตรวจสอบข้อมูลแล้วกดยืนยันบนแอปนี้" : "Scan successful. Review and confirm below.");
    await stopScanner();
  }

  async function startScanner() {
    if (isScanning) return;

    setScanError(null);
    setScanMessage(locale === "th" ? "กำลังเปิดกล้องเพื่อสแกน QR..." : "Opening camera for QR scan...");

    try {
      const scannerModule = await import("qr-scanner");
      const QrScanner = scannerModule.default;

      const hasCamera = await QrScanner.hasCamera();
      if (!hasCamera) {
        setScanError(locale === "th" ? "ไม่พบกล้องบนอุปกรณ์นี้" : "No camera available on this device.");
        setScanMessage(null);
        return;
      }

      if (!videoRef.current) {
        setScanError(locale === "th" ? "ไม่พบพื้นที่แสดงกล้อง" : "Camera preview is unavailable.");
        setScanMessage(null);
        return;
      }

      await stopScanner();

      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          const data = typeof result === "string" ? result : result?.data;
          if (!data) return;
          void handleScannedPayload(data);
        },
        {
          preferredCamera: "environment",
          maxScansPerSecond: 5,
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
        },
      );

      scannerRef.current = scanner;
      await scanner.start();
      setIsScanning(true);
      setScanMessage(locale === "th" ? "เล็งกล้องไปที่ QR บนหน้าล็อกอินแอดมิน" : "Point your camera to the admin login QR.");
    } catch (error) {
      setIsScanning(false);
      setScanMessage(null);
      setScanError(error instanceof Error ? error.message : locale === "th" ? "เปิดกล้องไม่สำเร็จ" : "Unable to start camera scanner.");
    }
  }

  async function approveChallenge() {
    if (!rawPayload || isApproving) return;

    setIsApproving(true);
    setScanError(null);

    try {
      const response = await fetch("/api/admin-qr-login/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ qrPayload: rawPayload }),
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setScanError(body.error ?? (locale === "th" ? "ยืนยัน QR ไม่สำเร็จ" : "Unable to approve QR login."));
        return;
      }

      setScanMessage(locale === "th" ? "ยืนยันสำเร็จ กลับไปหน้าแอดมิน ระบบจะล็อกอินอัตโนมัติ" : "Approved successfully. Return to admin login, it will sign in automatically.");
      toast.showToast(locale === "th" ? "ยืนยัน QR สำเร็จ" : "QR approval successful", "success");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : locale === "th" ? "เชื่อมต่อไม่สำเร็จ" : "Network request failed.");
    } finally {
      setIsApproving(false);
    }
  }

  useEffect(() => {
    void loadProfile();
    return () => {
      void stopScanner();
    };
  }, []);

  return (
    <section className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">
          {locale === "th" ? "สแกน QR สำหรับ Admin Login" : "Scan QR for Admin Login"}
        </h1>
      </div>

      {accessState === "loading" ? (
        <Card className="space-y-2">
          <p className="text-sm text-slate-600">{locale === "th" ? "กำลังตรวจสิทธิ์..." : "Checking permission..."}</p>
        </Card>
      ) : null}

      {accessState === "forbidden" ? (
        <Card className="space-y-2 border border-rose-200 bg-rose-50/70">
          <p className="text-sm font-semibold text-rose-700">
            {locale === "th"
              ? "บัญชีนี้ไม่มีสิทธิ์ยืนยัน QR ล็อกอินของฝั่งแอดมิน"
              : "This account does not have permission to approve admin QR login."}
          </p>
          <p className="text-xs text-rose-600">{locale === "th" ? "ต้องเป็น admin หรือ super_admin เท่านั้น" : "Only admin or super_admin are allowed."}</p>
        </Card>
      ) : null}

      {accessState === "allowed" ? (
        <>
          <Card className="space-y-3 border border-blue-200 bg-blue-50/70">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-700" />
              <div>
                <p className="text-sm font-semibold text-blue-800">{locale === "th" ? "พร้อมยืนยัน Admin QR Login" : "Ready to approve Admin QR Login"}</p>
                <p className="text-xs text-blue-700">
                  {locale === "th"
                    ? `สิทธิ์ปัจจุบัน: ${role} | ยืนยันได้เฉพาะ QR จากระบบแอดมินที่จับคู่ไว้`
                    : `Current role: ${role} | You can only approve trusted admin QR challenge.`}
                </p>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
              <video ref={videoRef} className="block h-[280px] w-full object-cover" muted playsInline />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => void startScanner()} disabled={isScanning}>
                <Camera className="mr-1.5 h-4 w-4" />
                {locale === "th" ? "เริ่มสแกน" : "Start scan"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void stopScanner()} disabled={!isScanning}>
                <StopCircle className="mr-1.5 h-4 w-4" />
                {locale === "th" ? "หยุดสแกน" : "Stop scan"}
              </Button>
            </div>

            {scanMessage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{scanMessage}</p> : null}
            {scanError ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{scanError}</p> : null}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{locale === "th" ? "ยืนยัน Challenge" : "Confirm Challenge"}</p>
              {challenge ? <span className="text-xs text-slate-500">TTL: {expiresInSeconds}s</span> : null}
            </div>

            {challenge ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  <strong>Ref:</strong> {challenge.challengeId}
                </p>
                <p>
                  <strong>Origin:</strong> {challenge.origin}
                </p>
                <p>
                  <strong>Expires:</strong> {new Date(challenge.expiresAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">{locale === "th" ? "ยังไม่มีข้อมูล QR กรุณาสแกนก่อน" : "No QR payload yet. Please scan first."}</p>
            )}

            <Button type="button" className="w-full" onClick={() => void approveChallenge()} disabled={!challenge || isApproving}>
              {isApproving ? (
                <>
                  <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                  {locale === "th" ? "กำลังยืนยัน..." : "Approving..."}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {locale === "th" ? "ยืนยันล็อกอินแอดมิน" : "Approve admin login"}
                </>
              )}
            </Button>
          </Card>

          <Card className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <QrCode className="h-4 w-4" />
              {locale === "th" ? "วาง QR Payload (สำรอง)" : "Paste QR payload (fallback)"}
            </div>
            <textarea
              value={manualPayload}
              onChange={(event) => setManualPayload(event.target.value)}
              className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
              placeholder={locale === "th" ? "วางข้อความ JSON จาก QR" : "Paste JSON payload from QR"}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleScannedPayload(manualPayload)}
              disabled={!manualPayload.trim()}
            >
              {locale === "th" ? "ใช้ข้อมูลนี้" : "Use this payload"}
            </Button>
          </Card>
        </>
      ) : null}
    </section>
  );
}



