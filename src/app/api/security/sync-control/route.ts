import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  VAULT_SYNC_CONTROL_COOKIE,
  clearVaultSyncRiskOverrideCookie,
  parseVaultSyncControlCookie,
  setVaultSyncRiskOverrideCookie,
} from "@/lib/vault-sync-control";

const syncControlSchema = z.object({
  allowSyncWhenRiskBlocked: z.boolean(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isEnabledForUser(rawCookie: string | undefined, userId: string) {
  const parsed = parseVaultSyncControlCookie(rawCookie);
  return Boolean(parsed && parsed.userId === userId && parsed.allowSyncWhenRiskBlocked);
}

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(VAULT_SYNC_CONTROL_COOKIE)?.value;
  const allowSyncWhenRiskBlocked = isEnabledForUser(rawCookie, user.id);

  const response = NextResponse.json({
    ok: true,
    allowSyncWhenRiskBlocked,
  });

  if (rawCookie && !allowSyncWhenRiskBlocked) {
    clearVaultSyncRiskOverrideCookie(response);
  }

  return response;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = syncControlSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const allowSyncWhenRiskBlocked = parsed.data.allowSyncWhenRiskBlocked;
  const response = NextResponse.json({
    ok: true,
    allowSyncWhenRiskBlocked,
    message: allowSyncWhenRiskBlocked
      ? "Temporary sync override is enabled."
      : "Risk-based sync block is enabled.",
  });

  setVaultSyncRiskOverrideCookie(response, user.id, allowSyncWhenRiskBlocked);

  await logAudit("vault_sync_risk_override_changed", {
    actor_user_id: user.id,
    allow_sync_when_risk_blocked: allowSyncWhenRiskBlocked,
  });

  return response;
}
