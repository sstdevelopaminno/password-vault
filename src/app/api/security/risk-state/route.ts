import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  VAULT_RISK_POLICY_COOKIE,
  clearVaultRiskPolicyCookie,
  isVaultRiskPolicyExpired,
  parseVaultRiskPolicyCookie,
} from "@/lib/vault-risk-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AuditRiskMetadata = {
  score?: number;
  severity?: string;
  actions?: string[];
  confidenceWarnings?: string[];
  source?: string;
  trigger?: string;
  playIntegrity?: {
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
  riskFactors?: Array<{ code?: string; type?: string; score?: number }>;
};

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const rawPolicy = cookieStore.get(VAULT_RISK_POLICY_COOKIE)?.value;
  const parsedPolicy = parseVaultRiskPolicyCookie(rawPolicy);
  const activePolicy = parsedPolicy && !isVaultRiskPolicyExpired(parsedPolicy) ? parsedPolicy : null;

  let latestAssessment: Record<string, unknown> | null = null;

  try {
    const admin = createAdminClient();
    const { data: latest, error } = await admin
      .from("audit_logs")
      .select("created_at,metadata_json")
      .eq("actor_user_id", user.id)
      .eq("action_type", "vault_risk_assessed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && latest?.metadata_json) {
      const metadata = (latest.metadata_json as AuditRiskMetadata) ?? {};
      latestAssessment = {
        createdAt: latest.created_at,
        score: metadata.score ?? null,
        severity: metadata.severity ?? null,
        actions: Array.isArray(metadata.actions) ? metadata.actions : [],
        confidenceWarnings: Array.isArray(metadata.confidenceWarnings) ? metadata.confidenceWarnings : [],
        source: metadata.source ?? null,
        trigger: metadata.trigger ?? null,
        playIntegrity: metadata.playIntegrity ?? null,
        riskFactors: Array.isArray(metadata.riskFactors) ? metadata.riskFactors : [],
      };
    }
  } catch (error) {
    console.error("Failed to fetch risk-state audit data:", error);
  }

  const response = NextResponse.json({
    ok: true,
    active: Boolean(activePolicy),
    policy: activePolicy,
    latestAssessment,
  });

  if (parsedPolicy && !activePolicy) {
    clearVaultRiskPolicyCookie(response);
  }

  return response;
}
