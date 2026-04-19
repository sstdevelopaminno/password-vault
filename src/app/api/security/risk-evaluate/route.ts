import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { clearVaultRiskPolicyCookie, setVaultRiskPolicyCookie, type VaultRiskPolicy } from "@/lib/vault-risk-policy";
import { evaluateVaultRisk, type VaultRiskSnapshot } from "@/lib/vault-risk";
import { getPlayIntegrityPackageName, verifyPlayIntegrityToken } from "@/lib/play-integrity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const riskEvaluateSchema = z.object({
  source: z.enum(["android-apk", "android-pwa", "ios-native", "ios-pwa", "browser", "server"]).optional(),
  collectedAt: z.string().datetime({ offset: true }).optional(),
  device: z.object({
    apiLevel: z.number().int().min(1).max(99).optional(),
    isEmulator: z.boolean().optional(),
    isDebuggable: z.boolean().optional(),
    hasTestKeys: z.boolean().optional(),
    suBinaryDetected: z.boolean().optional(),
    developerOptionsEnabled: z.boolean().optional(),
    adbEnabled: z.boolean().optional(),
    playIntegrityVerdict: z.enum(["strong", "device", "basic", "failed", "unknown"]).optional(),
  }).optional(),
  app: z.object({
    suspiciousApps: z.array(z.string().trim().min(1).max(180)).max(200).optional(),
    suspiciousAppCount: z.number().int().min(0).max(200).optional(),
    riskyInstallerApps: z.array(z.string().trim().min(1).max(220)).max(200).optional(),
    heuristicRiskyApps: z.array(z.string().trim().min(1).max(180)).max(220).optional(),
    highRiskPackageKeywordApps: z.array(z.string().trim().min(1).max(180)).max(200).optional(),
    adwareLikeApps: z.array(z.string().trim().min(1).max(180)).max(200).optional(),
    gameLikeApps: z.array(z.string().trim().min(1).max(180)).max(400).optional(),
    unknownInstallerCount: z.number().int().min(0).max(500).optional(),
    heuristicRiskyAppCount: z.number().int().min(0).max(500).optional(),
    adwareLikeCount: z.number().int().min(0).max(500).optional(),
    gameLikeCount: z.number().int().min(0).max(2000).optional(),
    packageVisibilityLimited: z.boolean().optional(),
    queryAllPackagesDeclared: z.boolean().optional(),
    installSource: z.string().trim().max(120).optional(),
    expectedInstallSource: z.string().trim().max(120).optional(),
  }).optional(),
  network: z.object({
    vpnActive: z.boolean().optional(),
    insecureTransport: z.boolean().optional(),
    proxyDetected: z.boolean().optional(),
    knownMaliciousDomainHit: z.boolean().optional(),
  }).optional(),
  links: z.object({
    phishingDomainMatched: z.boolean().optional(),
    dangerousDeepLinkMatched: z.boolean().optional(),
  }).optional(),
  meta: z.object({
    runtimeMode: z.string().trim().max(80).optional(),
    appVersion: z.string().trim().max(80).optional(),
    trigger: z.string().trim().max(80).optional(),
  }).optional(),
  playIntegrity: z.object({
    status: z.enum(["ok", "error", "skipped"]).optional(),
    nonce: z.string().trim().min(8).max(500).optional(),
    token: z.string().trim().min(20).max(10000).optional(),
    error: z.string().trim().max(500).optional(),
    errorCode: z.number().int().optional(),
  }).optional(),
});

function buildPolicyFromAssessment(
  assessment: ReturnType<typeof evaluateVaultRisk>,
): VaultRiskPolicy {
  const expiresAt = new Date(Date.now() + assessment.policyTtlSec * 1000).toISOString();
  return {
    version: 1,
    assessedAt: assessment.assessedAt,
    expiresAt,
    score: assessment.score,
    severity: assessment.severity,
    actions: assessment.actions,
    lockDurationSec: assessment.lockDurationSec,
    reasonCodes: assessment.factors.map((factor) => factor.code),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/security/risk-evaluate",
    usage: "POST a device/app/network risk snapshot to evaluate score and response actions.",
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawPayload = await request.json().catch(function () {
    return {};
  });

  const parsed = riskEvaluateSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const snapshot = parsed.data as VaultRiskSnapshot;
  const playIntegrityInput = parsed.data.playIntegrity;
  let playIntegrityVerification:
    | Awaited<ReturnType<typeof verifyPlayIntegrityToken>>
    | null = null;

  if (playIntegrityInput?.status === "ok" && playIntegrityInput.token && playIntegrityInput.nonce) {
    playIntegrityVerification = await verifyPlayIntegrityToken({
      integrityToken: playIntegrityInput.token,
      expectedNonce: playIntegrityInput.nonce,
      expectedPackageName: getPlayIntegrityPackageName(),
    });
    snapshot.device = {
      ...snapshot.device,
      playIntegrityVerdict: playIntegrityVerification.verdict,
    };
  } else if (playIntegrityInput?.status === "error") {
    snapshot.device = {
      ...snapshot.device,
      playIntegrityVerdict: "failed",
    };
  } else if (playIntegrityInput?.status === "skipped") {
    snapshot.device = {
      ...snapshot.device,
      playIntegrityVerdict: snapshot.device?.playIntegrityVerdict ?? "unknown",
    };
  }

  const assessment = evaluateVaultRisk(snapshot);
  const response = NextResponse.json({
    ok: true,
    assessment,
    playIntegrityClient: playIntegrityInput
      ? {
          status: playIntegrityInput.status ?? "unknown",
          errorCode: playIntegrityInput.errorCode,
          hasError: Boolean(playIntegrityInput.error),
        }
      : null,
    playIntegrityVerification: playIntegrityVerification
      ? {
          status: playIntegrityVerification.status,
          verdict: playIntegrityVerification.verdict,
          reasonCodes: playIntegrityVerification.reasonCodes,
          appRecognitionVerdict: playIntegrityVerification.appRecognitionVerdict,
          deviceRecognitionVerdicts: playIntegrityVerification.deviceRecognitionVerdicts,
          nonceMatched: playIntegrityVerification.nonceMatched,
          packageMatched: playIntegrityVerification.packageMatched,
          timestampFresh: playIntegrityVerification.timestampFresh,
          errorMessage: playIntegrityVerification.errorMessage,
        }
      : null,
  });

  if (assessment.actions.length > 0) {
    const policy = buildPolicyFromAssessment(assessment);
    setVaultRiskPolicyCookie(response, policy);
  } else {
    clearVaultRiskPolicyCookie(response);
  }

  try {
    await logAudit("vault_risk_assessed", {
      score: assessment.score,
      severity: assessment.severity,
      actions: assessment.actions,
      confidenceWarnings: assessment.confidenceWarnings,
      source: snapshot.source ?? "unknown",
      trigger: snapshot.meta?.trigger ?? "manual",
      playIntegrity: playIntegrityVerification
        ? {
            status: playIntegrityVerification.status,
            verdict: playIntegrityVerification.verdict,
            reasonCodes: playIntegrityVerification.reasonCodes,
            appRecognitionVerdict: playIntegrityVerification.appRecognitionVerdict,
            deviceRecognitionVerdicts: playIntegrityVerification.deviceRecognitionVerdicts,
            nonceMatched: playIntegrityVerification.nonceMatched,
            packageMatched: playIntegrityVerification.packageMatched,
            timestampFresh: playIntegrityVerification.timestampFresh,
            errorMessage: playIntegrityVerification.errorMessage,
          }
        : playIntegrityInput
          ? {
              status: playIntegrityInput.status ?? "unknown",
              verdict: null,
              reasonCodes: [],
              appRecognitionVerdict: null,
              deviceRecognitionVerdicts: [],
              nonceMatched: null,
              packageMatched: null,
              timestampFresh: null,
              errorMessage: playIntegrityInput.error ?? null,
            }
          : null,
      riskFactors: assessment.factors.map((factor) => ({
        code: factor.code,
        type: factor.type,
        score: factor.score,
      })),
    });
  } catch (auditError) {
    console.error("Failed to write risk assessment audit log:", auditError);
  }

  return response;
}
