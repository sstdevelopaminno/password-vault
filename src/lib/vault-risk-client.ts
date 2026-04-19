"use client";

import { APP_VERSION } from "@/lib/app-version";
import { detectRuntimeCapabilities } from "@/lib/pwa-runtime";
import {
  collectVaultShieldSignals,
  createPlayIntegrityNonce,
  getPlayIntegrityCloudProjectNumber,
  type VaultShieldSignals,
} from "@/lib/vault-shield";

export type VaultRiskEvaluateClientResult = {
  ok: boolean;
  signals: VaultShieldSignals | null;
  assessment?: {
    assessedAt: string;
    score: number;
    severity: "low" | "medium" | "high" | "critical";
    actions: string[];
    nextAssessmentInSec: number;
  };
  playIntegrityVerification?: {
    status?: string;
    verdict?: string;
    reasonCodes?: string[];
    appRecognitionVerdict?: string;
    deviceRecognitionVerdicts?: string[];
    nonceMatched?: boolean;
    packageMatched?: boolean;
    timestampFresh?: boolean;
    errorMessage?: string;
  } | null;
  status: number;
  error?: string;
};

export async function runVaultRiskEvaluation(trigger: string): Promise<VaultRiskEvaluateClientResult> {
  const runtime = detectRuntimeCapabilities();
  if (!runtime.isCapacitorNative || !runtime.isAndroid) {
    return {
      ok: false,
      signals: null,
      status: 400,
      error: "Not running on Android native runtime.",
    };
  }

  const cloudProjectNumber = getPlayIntegrityCloudProjectNumber();
  const playIntegrityNonce = cloudProjectNumber ? createPlayIntegrityNonce() : "";

  const nativeSignals = await collectVaultShieldSignals({
    playIntegrityNonce: playIntegrityNonce || undefined,
    playIntegrityCloudProjectNumber: cloudProjectNumber,
  });

  if (!nativeSignals) {
    return {
      ok: false,
      signals: null,
      status: 500,
      error: "Unable to collect VaultShield native signals.",
    };
  }

  const response = await fetch("/api/security/risk-evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      source: "android-apk",
      collectedAt: nativeSignals.collectedAt,
      device: {
        apiLevel: nativeSignals.apiLevel,
        isEmulator: nativeSignals.isEmulator,
        isDebuggable: nativeSignals.isDebuggable,
        hasTestKeys: nativeSignals.hasTestKeys,
        suBinaryDetected: nativeSignals.suBinaryDetected,
        developerOptionsEnabled: nativeSignals.developerOptionsEnabled,
        adbEnabled: nativeSignals.adbEnabled,
        playIntegrityVerdict: "unknown",
      },
      app: {
        suspiciousApps: nativeSignals.suspiciousApps,
        suspiciousAppCount: nativeSignals.suspiciousApps.length,
        riskyInstallerApps: nativeSignals.riskyInstallerApps ?? [],
        heuristicRiskyApps: nativeSignals.heuristicRiskyApps ?? [],
        highRiskPackageKeywordApps: nativeSignals.highRiskPackageKeywordApps ?? [],
        adwareLikeApps: nativeSignals.adwareLikeApps ?? [],
        gameLikeApps: nativeSignals.gameLikeApps ?? [],
        unknownInstallerCount: nativeSignals.unknownInstallerCount ?? 0,
        heuristicRiskyAppCount: nativeSignals.heuristicRiskyAppCount ?? 0,
        adwareLikeCount: nativeSignals.adwareLikeCount ?? 0,
        gameLikeCount: nativeSignals.gameLikeCount ?? 0,
        packageVisibilityLimited: nativeSignals.packageVisibilityLimited,
        queryAllPackagesDeclared: nativeSignals.queryAllPackagesDeclared,
        installSource: nativeSignals.installSource,
        expectedInstallSource: "com.android.vending",
      },
      network: {
        vpnActive: nativeSignals.vpnActive,
        insecureTransport: window.location.protocol !== "https:" && window.location.hostname !== "localhost",
        proxyDetected: false,
        knownMaliciousDomainHit: false,
      },
      links: {
        phishingDomainMatched: false,
        dangerousDeepLinkMatched: false,
      },
      meta: {
        appVersion: APP_VERSION,
        runtimeMode: runtime.mode,
        trigger,
      },
      playIntegrity: {
        status: nativeSignals.playIntegrityStatus ?? "skipped",
        nonce: playIntegrityNonce || undefined,
        token: nativeSignals.playIntegrityToken,
        error: nativeSignals.playIntegrityError,
        errorCode: nativeSignals.playIntegrityErrorCode,
      },
    }),
  });

  const body = (await response.json().catch(function () {
    return {};
  })) as {
    assessment?: VaultRiskEvaluateClientResult["assessment"];
    playIntegrityVerification?: VaultRiskEvaluateClientResult["playIntegrityVerification"];
    error?: string;
  };

  return {
    ok: response.ok,
    status: response.status,
    signals: nativeSignals,
    assessment: body.assessment,
    playIntegrityVerification: body.playIntegrityVerification ?? null,
    error: response.ok ? undefined : body.error || "Risk evaluation failed",
  };
}
