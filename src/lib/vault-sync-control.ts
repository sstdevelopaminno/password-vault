import type { NextResponse } from "next/server";
import { getSharedCookieOptions } from "@/lib/session-security";

export const VAULT_SYNC_CONTROL_COOKIE = "pv_sync_control_v1";

const VAULT_SYNC_CONTROL_VERSION = 1;
const VAULT_SYNC_CONTROL_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export type VaultSyncControlCookie = {
  version: 1;
  userId: string;
  allowSyncWhenRiskBlocked: boolean;
  updatedAt: string;
};

function toIso(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

export function parseVaultSyncControlCookie(value: string | undefined | null): VaultSyncControlCookie | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    const version = Number(raw.version ?? 0);
    const userId = String(raw.userId ?? "").trim();
    const allowSyncWhenRiskBlocked = raw.allowSyncWhenRiskBlocked === true;
    const updatedAt = toIso(raw.updatedAt);

    if (version !== VAULT_SYNC_CONTROL_VERSION) return null;
    if (!userId || !updatedAt) return null;

    return {
      version: 1,
      userId,
      allowSyncWhenRiskBlocked,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function isVaultSyncRiskOverrideEnabled(
  value: string | undefined | null,
  userId: string | undefined | null,
) {
  const parsed = parseVaultSyncControlCookie(value);
  if (!parsed) return false;
  if (!userId || parsed.userId !== userId) return false;
  return parsed.allowSyncWhenRiskBlocked === true;
}

export function setVaultSyncRiskOverrideCookie(
  response: NextResponse,
  userId: string,
  allowSyncWhenRiskBlocked: boolean,
) {
  if (!allowSyncWhenRiskBlocked) {
    clearVaultSyncRiskOverrideCookie(response);
    return;
  }

  const payload: VaultSyncControlCookie = {
    version: 1,
    userId,
    allowSyncWhenRiskBlocked: true,
    updatedAt: new Date().toISOString(),
  };

  response.cookies.set({
    name: VAULT_SYNC_CONTROL_COOKIE,
    value: encodeURIComponent(JSON.stringify(payload)),
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: VAULT_SYNC_CONTROL_TTL_SEC,
  });
}

export function clearVaultSyncRiskOverrideCookie(response: NextResponse) {
  response.cookies.set({
    name: VAULT_SYNC_CONTROL_COOKIE,
    value: "",
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: 0,
  });
}
