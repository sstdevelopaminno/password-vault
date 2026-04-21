import type { NextResponse } from "next/server";
import { getSharedCookieOptions } from "@/lib/session-security";

export const VAULT_SENSITIVE_CONTROL_COOKIE = "pv_sensitive_control_v1";

const VAULT_SENSITIVE_CONTROL_VERSION = 1;
const VAULT_SENSITIVE_CONTROL_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export type VaultSensitiveControlCookie = {
  version: 1;
  userId: string;
  allowSensitiveDataWhenRiskBlocked: boolean;
  updatedAt: string;
};

function toIso(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

export function parseVaultSensitiveControlCookie(value: string | undefined | null): VaultSensitiveControlCookie | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    const version = Number(raw.version ?? 0);
    const userId = String(raw.userId ?? "").trim();
    const allowSensitiveDataWhenRiskBlocked = raw.allowSensitiveDataWhenRiskBlocked === true;
    const updatedAt = toIso(raw.updatedAt);

    if (version !== VAULT_SENSITIVE_CONTROL_VERSION) return null;
    if (!userId || !updatedAt) return null;

    return {
      version: 1,
      userId,
      allowSensitiveDataWhenRiskBlocked,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function isVaultSensitiveRiskOverrideEnabled(
  value: string | undefined | null,
  userId: string | undefined | null,
) {
  const parsed = parseVaultSensitiveControlCookie(value);
  if (!parsed) return false;
  if (!userId || parsed.userId !== userId) return false;
  return parsed.allowSensitiveDataWhenRiskBlocked === true;
}

export function setVaultSensitiveRiskOverrideCookie(
  response: NextResponse,
  userId: string,
  allowSensitiveDataWhenRiskBlocked: boolean,
) {
  if (!allowSensitiveDataWhenRiskBlocked) {
    clearVaultSensitiveRiskOverrideCookie(response);
    return;
  }

  const payload: VaultSensitiveControlCookie = {
    version: 1,
    userId,
    allowSensitiveDataWhenRiskBlocked: true,
    updatedAt: new Date().toISOString(),
  };

  response.cookies.set({
    name: VAULT_SENSITIVE_CONTROL_COOKIE,
    value: encodeURIComponent(JSON.stringify(payload)),
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: VAULT_SENSITIVE_CONTROL_TTL_SEC,
  });
}

export function clearVaultSensitiveRiskOverrideCookie(response: NextResponse) {
  response.cookies.set({
    name: VAULT_SENSITIVE_CONTROL_COOKIE,
    value: "",
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: 0,
  });
}
