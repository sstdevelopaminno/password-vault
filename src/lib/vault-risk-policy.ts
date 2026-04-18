import { type NextResponse } from "next/server";
import { getSharedCookieOptions } from "@/lib/session-security";
import type { VaultRiskAction, VaultRiskSeverity } from "@/lib/vault-risk";

export const VAULT_RISK_POLICY_COOKIE = "pv_risk_policy_v1";

export type VaultRiskPolicy = {
  version: 1;
  assessedAt: string;
  expiresAt: string;
  score: number;
  severity: VaultRiskSeverity;
  actions: VaultRiskAction[];
  lockDurationSec: number;
  reasonCodes: string[];
};

function toIso(input: unknown) {
  if (typeof input !== "string") return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function parseVaultRiskPolicyCookie(value: string | undefined | null): VaultRiskPolicy | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    const severity = String(raw.severity ?? "");
    if (!["low", "medium", "high", "critical"].includes(severity)) {
      return null;
    }

    const actions = Array.isArray(raw.actions)
      ? raw.actions
        .map((item) => String(item))
        .filter((item) =>
          [
            "notify_user",
            "limit_sensitive_actions",
            "force_reauth",
            "suggest_uninstall_risky_apps",
            "block_sync",
            "block_sensitive_data",
            "lock_vault_temporarily",
          ].includes(item),
        )
      : [];

    const reasonCodes = Array.isArray(raw.reasonCodes)
      ? raw.reasonCodes.map((item) => String(item)).filter((item) => item.trim().length > 0).slice(0, 30)
      : [];

    const score = Number(raw.score ?? 0);
    const lockDurationSec = Number(raw.lockDurationSec ?? 0);

    const assessedAt = toIso(raw.assessedAt);
    const expiresAt = toIso(raw.expiresAt);
    if (!assessedAt || !expiresAt) return null;

    return {
      version: 1,
      assessedAt,
      expiresAt,
      score: Number.isFinite(score) ? Math.max(0, Math.min(999, Math.floor(score))) : 0,
      severity: severity as VaultRiskSeverity,
      actions: actions as VaultRiskAction[],
      lockDurationSec: Number.isFinite(lockDurationSec) ? Math.max(0, Math.min(3600, Math.floor(lockDurationSec))) : 0,
      reasonCodes,
    };
  } catch {
    return null;
  }
}

export function isVaultRiskPolicyExpired(policy: VaultRiskPolicy) {
  return new Date(policy.expiresAt).getTime() <= Date.now();
}

export function setVaultRiskPolicyCookie(response: NextResponse, policy: VaultRiskPolicy) {
  const ttlSec = Math.max(
    60,
    Math.floor((new Date(policy.expiresAt).getTime() - Date.now()) / 1000),
  );
  response.cookies.set({
    name: VAULT_RISK_POLICY_COOKIE,
    value: encodeURIComponent(JSON.stringify(policy)),
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: ttlSec,
  });
}

export function clearVaultRiskPolicyCookie(response: NextResponse) {
  response.cookies.set({
    name: VAULT_RISK_POLICY_COOKIE,
    value: "",
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: 0,
  });
}
