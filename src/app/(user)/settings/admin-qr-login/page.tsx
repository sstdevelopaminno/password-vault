"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, RefreshCw, ScanLine, ShieldCheck, StopCircle } from "lucide-react";
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
  const [challenge, setChallenge] = useState<AdminQrPayload | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const approveLockRef = useRef(false);
  const approvedChallengeIdsRef = useRef<Set<string>>(new Set());

  const expiresInSeconds = useMemo(() => {
    if (!challenge) return 0;
    const remain = Date.parse(challenge.expiresAt) - Date.now();
    return Math.max(0, Math.floor(remain / 1000));
  }, [challenge]);

  function resetStatus() {
    setScanError(null);
    setScanMessage(null);
  }

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

  async function approveChallenge(rawPayload: string, scanned: AdminQrPayload) {
    if (!rawPayload || approveLockRef.current) return;
    if (approvedChallengeIdsRef.current.has(scanned.challengeId)) {
      setScanMessage(
        locale === "th"
          ? "Challenge นี้ยืนยันเรียบร้อยแล้ว กรุณากลับไปหน้าแอดมิน"
          : "This challenge is already approved. Return to the admin screen.",
      );
      return;
    }

    approveLockRef.current = true;
    setIsApproving(true);
    setScanError(null);

    const maxAttempts = 3;
    let latestError =
      locale === "th" ? "ยืนยัน QR ไม่สำเร็จ กรุณาลองสแกนใหม่" : "Unable to approve QR login. Please scan again.";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch("/api/admin-qr-login/approve", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ qrPayload: rawPayload }),
          signal: controller.signal,
        });

        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.ok) {
          approvedChallengeIdsRef.current.add(scanned.challengeId);
          setScanMessage(
            locale === "th"
              ? "ยืนยันสำเร็จอัตโนมัติ กลับไปหน้าแอดมินเพื่อเข้าใช้งานได้ทันที"
              : "Auto-approval successful. Return to admin login to continue.",
          );
          toast.showToast(locale === "th" ? "ยืนยัน QR สำเร็จ" : "QR approval successful", "success");
          return;
        }

        latestError = body.error ?? (locale === "th" ? "ยืนยัน QR ไม่สำเร็จ" : "Unable to approve QR login.");
        const shouldRetry = response.status >= 500 || response.status === 429 || response.status === 408;
        if (!shouldRetry || attempt === maxAttempts) break;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          latestError = locale === "th" ? "หมดเวลาการยืนยัน QR กรุณาลองใหม่" : "QR approval timed out. Please retry.";
        } else {
          latestError =
            error instanceof Error
              ? error.message
              : locale === "th"
                ? "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"
                : "Network request failed. Please retry.";
        }
        if (attempt === maxAttempts) break;
      } finally {
        clearTimeout(timeout);
      }

      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }

    setScanError(latestError);
    setScanMessage(null);
    setIsApproving(false);
    approveLockRef.current = false;
    return;
  }

  async function handleScannedPayload(raw: string) {
    if (approveLockRef.current) return;
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

    setChallenge(parsed.payload);
    setScanError(null);
    setScanMessage(locale === "th" ? "สแกนสำเร็จ กำลังยืนยันอัตโนมัติ..." : "Scan successful. Auto-approving...");
    await stopScanner();
    await approveChallenge(trimmed, parsed.payload);
    setIsApproving(false);
    approveLockRef.current = false;
  }

  async function startScanner() {
    if (isScanning || isApproving || approveLockRef.current) return;

    resetStatus();
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
              <Button type="button" onClick={() => void startScanner()} disabled={isScanning || isApproving}>
                <ScanLine className="mr-1.5 h-4 w-4" />
                {locale === "th" ? "สแกน QR" : "Scan QR"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void stopScanner()} disabled={!isScanning || isApproving}>
                <StopCircle className="mr-1.5 h-4 w-4" />
                {locale === "th" ? "หยุดสแกน" : "Stop scan"}
              </Button>
            </div>

            {scanMessage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{scanMessage}</p> : null}
            {scanError ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{scanError}</p> : null}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{locale === "th" ? "สถานะการยืนยันอัตโนมัติ" : "Auto-approval status"}</p>
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
              <p className="text-xs text-slate-500">{locale === "th" ? "ยังไม่มีข้อมูล QR กรุณากดสแกน QR ก่อน" : "No QR payload yet. Please scan QR first."}</p>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {isApproving ? (
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {locale === "th" ? "กำลังยืนยัน QR อัตโนมัติ..." : "Auto-approving QR login..."}
                </span>
              ) : locale === "th" ? (
                "ระบบจะยืนยันให้อัตโนมัติทันทีหลังสแกนสำเร็จ"
              ) : (
                "The system automatically approves immediately after a successful scan."
              )}
            </div>
          </Card>
        </>
      ) : null}
    </section>
  );
}



