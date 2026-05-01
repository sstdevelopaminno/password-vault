import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePinAssertion } from "@/lib/pin-guard";
import { logAudit } from "@/lib/audit";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  ACTIVE_SESSION_COOKIE,
  getSharedCookieOptions,
} from "@/lib/session-security";
import { clearVaultRiskPolicyCookie } from "@/lib/vault-risk-policy";

const payloadSchema = z.object({
  otp: z.string().regex(/^\d{6}$/),
  confirmationText: z.string().trim().min(1).max(220),
});

const CONFIRM_SUFFIX = "ยืนยันการลบข้อมูลและบัญชีนี้ อย่างถาวร";

function normalizeSpaces(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid delete-account payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pinCheck = await requirePinAssertion({
    request: req,
    userId: user.id,
    action: "delete_account",
    targetItemId: user.id,
  });
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const ip = clientIp(req);
  const rate = await takeRateLimit(`delete-account:${ip}:${user.id}`, { limit: 6, windowMs: 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please wait.", retryAfterSec: rate.retryAfterSec }, { status: 429 });
  }

  const admin = createAdminClient();
  const profileRes = await admin
    .from("profiles")
    .select("id,full_name,email,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileRes.error) {
    return NextResponse.json({ error: profileRes.error.message }, { status: 400 });
  }
  if (!profileRes.data?.id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = profileRes.data;
  if (String(profile.status) === "disabled") {
    return NextResponse.json({ error: "Account already disabled" }, { status: 409 });
  }

  const expectedPhrase = normalizeSpaces(`${profile.full_name} ${CONFIRM_SUFFIX}`);
  const gotPhrase = normalizeSpaces(parsed.data.confirmationText);
  if (gotPhrase !== expectedPhrase) {
    return NextResponse.json(
      {
        error: "Confirmation text does not match",
        expectedPhrase,
      },
      { status: 400 },
    );
  }

  const verifyOtp = await supabase.auth.verifyOtp({
    email: String(profile.email ?? "").toLowerCase(),
    token: parsed.data.otp,
    type: "email",
  });
  if (verifyOtp.error) {
    return NextResponse.json({ error: verifyOtp.error.message }, { status: 400 });
  }

  const requestedAt = new Date();
  const recoverUntil = new Date(requestedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const supportUntil = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upsertRes = await admin
    .from("account_deletion_requests")
    .upsert(
      {
        user_id: user.id,
        requested_at: requestedAt.toISOString(),
        recover_until: recoverUntil.toISOString(),
        support_until: supportUntil.toISOString(),
        purge_at: supportUntil.toISOString(),
        status: "pending",
        confirmation_phrase: expectedPhrase,
        metadata_json: {
          requested_ip: ip,
          pin_asserted: true,
          otp_verified: true,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (upsertRes.error) {
    return NextResponse.json({ error: upsertRes.error.message }, { status: 400 });
  }

  const disableRes = await admin
    .from("profiles")
    .update({ status: "disabled" })
    .eq("id", user.id);
  if (disableRes.error) {
    return NextResponse.json({ error: disableRes.error.message }, { status: 400 });
  }

  const appMeta =
    user.app_metadata && typeof user.app_metadata === "object"
      ? ({ ...user.app_metadata } as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  appMeta.account_deletion = {
    status: "pending",
    requested_at: requestedAt.toISOString(),
    recover_until: recoverUntil.toISOString(),
    support_until: supportUntil.toISOString(),
    purge_at: supportUntil.toISOString(),
  };

  const metaRes = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMeta });
  if (metaRes.error) {
    return NextResponse.json({ error: metaRes.error.message }, { status: 400 });
  }

  await logAudit("account_deletion_requested", {
    actor_user_id: user.id,
    target_user_id: user.id,
    requested_at: requestedAt.toISOString(),
    recover_until: recoverUntil.toISOString(),
    support_until: supportUntil.toISOString(),
    purge_at: supportUntil.toISOString(),
  });

  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const response = NextResponse.json({
    ok: true,
    message: "Account deletion requested",
    retention: {
      recoverUntil: recoverUntil.toISOString(),
      supportUntil: supportUntil.toISOString(),
      purgeAt: supportUntil.toISOString(),
    },
  });

  response.cookies.set({
    name: ACTIVE_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    ...getSharedCookieOptions(),
    maxAge: 0,
  });
  clearVaultRiskPolicyCookie(response);
  return response;
}
