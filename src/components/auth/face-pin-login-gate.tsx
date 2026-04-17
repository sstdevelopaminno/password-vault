"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CameraAccessError, captureFaceSample, startCamera, stopCamera } from "@/lib/face-template";

type FacePinLoginGateProps = {
  children?: React.ReactNode;
  enabled: boolean;
  hasPin: boolean;
};

export function FacePinLoginGate({ children, enabled, hasPin }: FacePinLoginGateProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const [otpRequestLoading, setOtpRequestLoading] = useState(false);
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [error, setError] = useState("");

  const mapCameraError = useCallback((cameraError: unknown) => {
    if (cameraError instanceof CameraAccessError) {
      if (cameraError.code === "permission-denied") {
        return "Camera permission is denied. Please allow access and retry, or continue with OTP fallback.";
      }
      if (cameraError.code === "device-not-found") {
        return "No front camera found on this device. Continue with OTP fallback.";
      }
      if (cameraError.code === "device-busy") {
        return "Camera is busy in another app. Close other camera apps and retry, or use OTP fallback.";
      }
      if (cameraError.code === "not-supported") {
        return "This device/browser does not support camera access. Continue with OTP fallback.";
      }
    }
    if (cameraError instanceof Error && cameraError.message) return cameraError.message;
    return "Unable to access camera. Continue with OTP fallback.";
  }, []);

  const stopCameraNow = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stopCamera(streamRef.current);
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCameraNow = useCallback(async () => {
    if (!required || verified) return;
    if (!videoRef.current) return;
    stopCameraNow();

    try {
      const stream = await startCamera(videoRef.current);
      if (!mountedRef.current) {
        stopCamera(stream);
        return;
      }
      streamRef.current = stream;
      setCameraReady(true);
    } catch (cameraError) {
      setCameraReady(false);
      setError(mapCameraError(cameraError));
    }
  }, [mapCameraError, required, stopCameraNow, verified]);

  const loadSession = useCallback(async () => {
    if (!enabled || !hasPin) {
      setRequired(false);
      setVerified(true);
      setChecking(false);
      return;
    }

    setChecking(true);
    setError("");

    try {
      const response = await fetch("/api/face-auth/session", {
        method: "GET",
        cache: "no-store",
      });

      const body = (await response.json().catch(() => ({}))) as {
        required?: boolean;
        verified?: boolean;
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setRequired(true);
        setVerified(false);
        setError(String(body.error ?? "Unable to check status."));
        return;
      }

      const nextRequired = Boolean(body.required);
      const nextVerified = Boolean(body.verified);

      setRequired(nextRequired);
      setVerified(!nextRequired || nextVerified);
    } catch {
      setRequired(true);
      setVerified(false);
      setError("Network error. Please retry.");
    } finally {
      if (mountedRef.current) {
        setChecking(false);
      }
    }
  }, [enabled, hasPin, router]);

  const verifyNow = useCallback(async () => {
    if (loading || pin.length !== 6 || !videoRef.current || !cameraReady) return;

    setLoading(true);
    setError("");
    try {
      const sample = captureFaceSample(videoRef.current);
      const response = await fetch("/api/face-auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          sample: {
            vector: sample.vector,
            quality: sample.quality,
            motionScore: 0,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setError(String(body.error ?? "PIN + Face verification failed."));
        return;
      }

      setVerified(true);
      setPin("");
      stopCameraNow();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [cameraReady, loading, pin, router, stopCameraNow]);

  const requestRecoveryOtp = useCallback(async () => {
    if (otpRequestLoading || resendIn > 0) return;

    setOtpRequestLoading(true);
    setError("");
    try {
      const response = await fetch("/api/face-auth/recovery/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        retryAfterSec?: number;
      };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setError(String(body.error ?? "Unable to request OTP."));
        return;
      }

      setRecoveryOpen(true);
      const retryAfter = Number(body.retryAfterSec ?? 60);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setResendIn(retryAfter);
      }
    } catch {
      setError("Network error. Please retry.");
    } finally {
      if (mountedRef.current) {
        setOtpRequestLoading(false);
      }
    }
  }, [otpRequestLoading, resendIn, router]);

  const verifyRecoveryOtp = useCallback(async () => {
    if (otpVerifyLoading || recoveryOtp.length !== 6) return;

    setOtpVerifyLoading(true);
    setError("");
    try {
      const response = await fetch("/api/face-auth/recovery/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: recoveryOtp }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setError(String(body.error ?? "Invalid OTP."));
        return;
      }

      setVerified(true);
      setRecoveryOtp("");
      setRecoveryOpen(false);
      stopCameraNow();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      if (mountedRef.current) {
        setOtpVerifyLoading(false);
      }
    }
  }, [otpVerifyLoading, recoveryOtp, router, stopCameraNow]);

  const signOutNow = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSession();
    return () => {
      mountedRef.current = false;
      stopCameraNow();
    };
  }, [loadSession, stopCameraNow]);

  useEffect(() => {
    if (!checking && required && !verified) {
      void startCameraNow();
    }
  }, [checking, required, startCameraNow, verified]);

  useEffect(() => {
    if (verified || !required) {
      stopCameraNow();
    }
  }, [required, stopCameraNow, verified]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  if (verified || !required) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {children}
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
        <div className="w-full max-w-[520px]">
          <Card className="space-y-4 rounded-[24px] border border-[var(--border-strong)] bg-white p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">Verify PIN + Face to continue</h3>
                <p className="mt-1 text-sm text-slate-600">
                  This account requires PIN and face verification after sign-in.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <video ref={videoRef} className="aspect-square w-full bg-slate-950 object-cover" muted playsInline />
            </div>

            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit PIN"
            />

            {error ? <p className="text-xs text-rose-600">{error}</p> : null}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void startCameraNow()} disabled={loading}>
                <span className="inline-flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Restart camera
                </span>
              </Button>
              <Button onClick={() => void verifyNow()} disabled={loading || pin.length !== 6 || !cameraReady}>
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    Verifying...
                  </span>
                ) : (
                  "Verify PIN + Face"
                )}
              </Button>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs font-semibold text-amber-900">Fallback when camera is unavailable</p>
              <p className="mt-1 text-[11px] text-amber-800">
                Request email OTP to temporarily unlock this session.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void requestRecoveryOtp()}
                  disabled={otpRequestLoading || resendIn > 0}
                >
                  {otpRequestLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      Sending OTP...
                    </span>
                  ) : resendIn > 0 ? (
                    `Resend in ${resendIn}s`
                  ) : (
                    "Request OTP"
                  )}
                </Button>
                <Button
                  variant={recoveryOpen ? "default" : "secondary"}
                  onClick={() => setRecoveryOpen((value) => !value)}
                  disabled={otpVerifyLoading}
                >
                  Enter OTP
                </Button>
              </div>

              {recoveryOpen ? (
                <div className="mt-2 space-y-2">
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={recoveryOtp}
                    onChange={(event) => setRecoveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit OTP"
                  />
                  <Button
                    className="w-full"
                    onClick={() => void verifyRecoveryOtp()}
                    disabled={otpVerifyLoading || recoveryOtp.length !== 6}
                  >
                    {otpVerifyLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner />
                        Verifying OTP...
                      </span>
                    ) : (
                      "Verify OTP and unlock"
                    )}
                  </Button>
                </div>
              ) : null}
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void signOutNow()}
              disabled={loading || otpRequestLoading || otpVerifyLoading}
            >
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
