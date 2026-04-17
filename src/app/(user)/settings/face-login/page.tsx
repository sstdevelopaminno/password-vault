"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Camera, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import { CameraAccessError, captureFaceSample, cosineSimilarity, startCamera, stopCamera } from "@/lib/face-template";

type FaceSampleState = {
  vector: number[];
  quality: number;
  motionScore: number;
};

type FaceConfigPayload = {
  faceAuthEnabled?: boolean;
  faceEnrolled?: boolean;
  faceEnrolledAt?: string | null;
  hasPin?: boolean;
  error?: string;
};

export default function FaceLoginSettingsPage() {
  const { locale } = useI18n();
  const toast = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const [hasPin, setHasPin] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrolledAt, setEnrolledAt] = useState("");

  const [pin, setPin] = useState("");
  const [samples, setSamples] = useState<FaceSampleState[]>([]);

  const sampleQuality = useMemo(() => {
    if (!samples.length) return 0;
    return samples.reduce((sum, entry) => sum + entry.quality, 0) / samples.length;
  }, [samples]);

  const mapCameraError = useCallback((error: unknown) => {
    if (error instanceof CameraAccessError) {
      if (error.code === "permission-denied") {
        return locale === "th"
          ? "ไม่อนุญาตการใช้กล้อง กรุณากด Allow ในเบราว์เซอร์หรือระบบ แล้วลองใหม่อีกครั้ง"
          : "Camera permission is denied. Please allow camera access and retry.";
      }
      if (error.code === "device-not-found") {
        return locale === "th"
          ? "ไม่พบกล้องด้านหน้าในอุปกรณ์นี้"
          : "No front camera was found on this device.";
      }
      if (error.code === "device-busy") {
        return locale === "th"
          ? "กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปกล้องอื่นแล้วลองใหม่"
          : "Camera is busy in another app. Close other camera apps and retry.";
      }
      if (error.code === "not-supported") {
        return locale === "th"
          ? "อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการใช้กล้อง"
          : "This device/browser does not support camera access.";
      }
    }
    if (error instanceof Error && error.message) return error.message;
    return locale === "th" ? "ไม่สามารถเปิดกล้องได้" : "Unable to access camera.";
  }, [locale]);

  const stopCameraNow = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stopCamera(streamRef.current);
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCameraNow = useCallback(async () => {
    if (!videoRef.current) return;
    stopCameraNow();

    try {
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      setCameraReady(true);
    } catch (error) {
      setCameraReady(false);
      toast.showToast(mapCameraError(error), "error");
    }
  }, [mapCameraError, stopCameraNow, toast]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/face-auth/config", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as FaceConfigPayload;
      if (!response.ok) {
        toast.showToast(String(body.error ?? "Unable to load settings"), "error");
        return;
      }

      setEnabled(Boolean(body.faceAuthEnabled));
      setEnrolled(Boolean(body.faceEnrolled));
      setEnrolledAt(String(body.faceEnrolledAt ?? ""));
      setHasPin(Boolean(body.hasPin));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const verifyPinAssertion = useCallback(async () => {
    if (pin.length !== 6) {
      toast.showToast(locale === "th" ? "เธเธฃเธธเธ“เธฒเธเธฃเธญเธ PIN 6 เธซเธฅเธฑเธ" : "Please enter a 6-digit PIN.", "error");
      return "";
    }

    const verifyResponse = await fetch("/api/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, action: "unlock_app" }),
    });
    const verifyBody = (await verifyResponse.json().catch(() => ({}))) as {
      assertionToken?: string;
      error?: string;
    };

    if (!verifyResponse.ok || !verifyBody.assertionToken) {
      toast.showToast(
        String(
          verifyBody.error ??
            (locale === "th" ? "PIN เนเธกเนเธ–เธนเธเธ•เนเธญเธเธซเธฃเธทเธญเธซเธกเธ”เธญเธฒเธขเธธ" : "PIN verification failed."),
        ),
        "error",
      );
      return "";
    }

    return String(verifyBody.assertionToken);
  }, [locale, pin, toast]);

  const captureSample = useCallback(() => {
    if (!cameraReady || !videoRef.current) {
      toast.showToast(locale === "th" ? "เธเธฅเนเธญเธเธขเธฑเธเนเธกเนเธเธฃเนเธญเธก" : "Camera is not ready.", "error");
      return;
    }

    const sample = captureFaceSample(videoRef.current);
    const previous = samples[samples.length - 1];
    const similarity = previous ? cosineSimilarity(previous.vector, sample.vector) : 0;
    const motionScore = previous ? Number(Math.max(0, 1 - Math.max(-1, Math.min(1, similarity))).toFixed(4)) : 0;

    if (previous && similarity > 0.995) {
      toast.showToast(
        locale === "th"
          ? "เธเธฃเธธเธ“เธฒเธเธขเธฑเธเธกเธธเธกเธซเธเนเธฒเน€เธฅเนเธเธเนเธญเธขเธเนเธญเธเธเธฑเธเธ—เธถเธเธ•เธฑเธงเธญเธขเนเธฒเธเธ–เธฑเธ”เนเธ"
          : "Please move your face slightly before capturing the next sample.",
        "error",
      );
      return;
    }

    const next: FaceSampleState = {
      vector: sample.vector,
      quality: sample.quality,
      motionScore,
    };

    setSamples((current) => [...current, next].slice(0, 5));
    toast.showToast(
      locale === "th"
        ? `เธเธฑเธเธ—เธถเธเธ•เธฑเธงเธญเธขเนเธฒเธเนเธฅเนเธง ${samples.length + 1} เธฃเธฒเธขเธเธฒเธฃ`
        : `Sample ${samples.length + 1} captured.`,
      "success",
    );
  }, [cameraReady, locale, samples, toast]);

  const enrollNow = useCallback(async () => {
    if (saving) return;
    if (samples.length < 2) {
      toast.showToast(
        locale === "th" ? "เธ•เนเธญเธเธกเธตเธ•เธฑเธงเธญเธขเนเธฒเธเนเธเธซเธเนเธฒเธญเธขเนเธฒเธเธเนเธญเธข 2 เธเธฃเธฑเนเธ" : "At least 2 samples are required.",
        "error",
      );
      return;
    }

    setSaving(true);
    try {
      const assertionToken = await verifyPinAssertion();
      if (!assertionToken) return;

      const response = await fetch("/api/face-auth/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pin-assertion": assertionToken,
        },
        body: JSON.stringify({ samples }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        toast.showToast(String(body.error ?? "Unable to enroll face login."), "error");
        return;
      }

      toast.showToast(
        locale === "th" ? "เธเธฑเธเธ—เธถเธ Face Login เธชเธณเน€เธฃเนเธ" : "Face login enrolled successfully.",
        "success",
      );
      setSamples([]);
      await loadConfig();
    } finally {
      setSaving(false);
    }
  }, [loadConfig, locale, samples, saving, toast, verifyPinAssertion]);

  const toggleFeature = useCallback(async (nextEnabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const assertionToken = await verifyPinAssertion();
      if (!assertionToken) return;

      const response = await fetch("/api/face-auth/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pin-assertion": assertionToken,
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        toast.showToast(String(body.error ?? "Unable to update face login setting."), "error");
        return;
      }

      setEnabled(nextEnabled);
      toast.showToast(
        nextEnabled
          ? locale === "th"
            ? "เน€เธเธดเธ”เนเธเนเธเธฒเธ Face Login เนเธฅเนเธง"
            : "Face login enabled."
          : locale === "th"
            ? "เธเธดเธ”เนเธเนเธเธฒเธ Face Login เนเธฅเนเธง"
            : "Face login disabled.",
        "success",
      );
    } finally {
      setSaving(false);
    }
  }, [locale, saving, toast, verifyPinAssertion]);

  const removeEnrollment = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const assertionToken = await verifyPinAssertion();
      if (!assertionToken) return;

      const response = await fetch("/api/face-auth/enroll", {
        method: "DELETE",
        headers: {
          "x-pin-assertion": assertionToken,
        },
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        toast.showToast(String(body.error ?? "Unable to remove face login data."), "error");
        return;
      }

      toast.showToast(
        locale === "th" ? "เธฅเธเธเนเธญเธกเธนเธฅ Face Login เนเธฅเนเธง" : "Face login data removed.",
        "success",
      );
      setEnabled(false);
      setEnrolled(false);
      setEnrolledAt("");
      setSamples([]);
      await loadConfig();
    } finally {
      setSaving(false);
    }
  }, [loadConfig, locale, saving, toast, verifyPinAssertion]);

  useEffect(() => {
    void loadConfig();
    return () => {
      stopCameraNow();
    };
  }, [loadConfig, stopCameraNow]);

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
          {locale === "th" ? "Face Login + PIN" : "Face Login + PIN"}
        </h1>
      </div>

      <Card className="space-y-4 rounded-[24px] p-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">
                {locale === "th" ? "เธชเธ–เธฒเธเธฐเธเธฒเธฃเน€เธเธดเธ”เนเธเนเธเธฒเธ" : "Feature status"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {enabled
                  ? locale === "th"
                    ? "เน€เธเธดเธ”เนเธเนเธเธฒเธเธญเธขเธนเน"
                    : "Enabled"
                  : locale === "th"
                    ? "เธขเธฑเธเนเธกเนเน€เธเธดเธ”เนเธเนเธเธฒเธ"
                    : "Disabled"}
              </p>
              {enrolledAt ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  {locale === "th" ? "เธฅเธเธ—เธฐเน€เธเธตเธขเธเธฅเนเธฒเธชเธธเธ”: " : "Last enrolled: "}
                  {new Date(enrolledAt).toLocaleString()}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">
                {locale === "th" ? "เธขเธทเธเธขเธฑเธเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธขเธ”เนเธงเธข PIN เธเนเธญเธเธเธฑเธเธ—เธถเธ" : "PIN confirmation is required for all changes"}
              </p>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={locale === "th" ? "PIN 6 เธซเธฅเธฑเธ" : "6-digit PIN"}
              />
              {!hasPin ? (
                <p className="text-xs text-rose-600">
                  {locale === "th"
                    ? "เธเธฑเธเธเธตเธเธตเนเธขเธฑเธเนเธกเนเนเธ”เนเธ•เธฑเนเธ PIN เธเธฃเธธเธ“เธฒเธ•เธฑเนเธ PIN เนเธเน€เธกเธเธน Settings เธเนเธญเธ"
                    : "This account does not have a PIN yet. Set PIN in Settings first."}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={enabled ? "default" : "secondary"}
                disabled={saving || !hasPin || !enrolled}
                onClick={() => void toggleFeature(true)}
              >
                {locale === "th" ? "เน€เธเธดเธ”เนเธเนเธเธฒเธ" : "Enable"}
              </Button>
              <Button
                variant={!enabled ? "default" : "secondary"}
                disabled={saving || !hasPin}
                onClick={() => void toggleFeature(false)}
              >
                {locale === "th" ? "เธเธดเธ”เนเธเนเธเธฒเธ" : "Disable"}
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <video ref={videoRef} className="aspect-square w-full bg-slate-950 object-cover" muted playsInline />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void startCameraNow()} disabled={saving}>
                <span className="inline-flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  {locale === "th" ? "เน€เธเธดเธ”เธเธฅเนเธญเธ" : "Start camera"}
                </span>
              </Button>
              <Button onClick={captureSample} disabled={saving || !cameraReady}>
                {locale === "th" ? "เธเธฑเธเธ—เธถเธเธ•เธฑเธงเธญเธขเนเธฒเธ" : "Capture sample"}
              </Button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                {locale === "th" ? "เธ•เธฑเธงเธญเธขเนเธฒเธเธ—เธตเนเธเธฑเธเธ—เธถเธ: " : "Captured samples: "}
                {samples.length}
              </p>
              <p>
                {locale === "th" ? "เธเธธเธ“เธ เธฒเธเน€เธเธฅเธตเนเธข: " : "Average quality: "}
                {sampleQuality.toFixed(2)}
              </p>
              <p>
                {locale === "th"
                  ? "เนเธเธฐเธเธณเนเธซเนเธเธฑเธเธ—เธถเธ 2-3 เธเธฃเธฑเนเธ เนเธฅเธฐเธเธขเธฑเธเธกเธธเธกเธซเธเนเธฒเน€เธฅเนเธเธเนเธญเธขเธ—เธธเธเธเธฃเธฑเนเธ"
                  : "Capture 2-3 samples and move your face slightly between captures."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => void enrollNow()}
                disabled={saving || !hasPin || samples.length < 2}
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    {locale === "th" ? "เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ..." : "Saving..."}
                  </span>
                ) : locale === "th" ? (
                  "เธฅเธเธ—เธฐเน€เธเธตเธขเธ Face"
                ) : (
                  "Enroll face"
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSamples([])}
                disabled={saving || samples.length === 0}
              >
                {locale === "th" ? "เธฅเนเธฒเธเธ•เธฑเธงเธญเธขเนเธฒเธ" : "Clear samples"}
              </Button>
            </div>

            {enrolled ? (
              <Button
                variant="destructive"
                onClick={() => void removeEnrollment()}
                disabled={saving || !hasPin}
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  {locale === "th" ? "เธฅเธเธเนเธญเธกเธนเธฅ Face Login" : "Delete face login data"}
                </span>
              </Button>
            ) : null}

            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
              <p className="font-semibold">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {locale === "th" ? "เธเนเธญเธกเธนเธฅเธ—เธตเนเธเธฑเธ”เน€เธเนเธ" : "Stored data"}
                </span>
              </p>
              <p className="mt-1">
                {locale === "th"
                  ? "เธฃเธฐเธเธเน€เธเนเธเน€เธเธเธฒเธฐ face template เนเธเธเน€เธเนเธฒเธฃเธซเธฑเธช เนเธกเนเน€เธเนเธเธ เธฒเธเธ–เนเธฒเธขเธ•เนเธเธเธเธฑเธ"
                  : "Only encrypted face templates are stored. Raw face photos are not persisted."}
              </p>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

