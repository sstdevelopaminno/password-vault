import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { isPaymentSlipProviderConfigured, verifyPackageSlipWithProvider } from "@/lib/payment-slip-provider";
import { applyWalletTransaction, getWalletBalance } from "@/lib/wallet";

type TopupOrderRow = {
  id: string;
  user_id: string;
  status: "pending" | "paid" | "expired" | "rejected";
  base_amount_thb: number | string;
  unique_amount_thb: number | string;
  promptpay_target: string;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
};

const verifySchema = z.object({
  topupOrderId: z.uuid(),
  provider: z.string().trim().min(1).max(40).default("manual"),
  slipImageUrl: z.string().url().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  amountThb: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  receiverAccount: z.string().trim().max(40).optional().nullable(),
  payerAccount: z.string().trim().max(40).optional().nullable(),
  payerName: z.string().trim().max(120).optional().nullable(),
  transferredAt: z.string().datetime({ offset: true }).optional().nullable(),
  rawPayload: z.unknown().optional(),
});

function toDateKeyInTimezone(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function closeAmount(actual: number, expected: number) {
  return Math.abs(actual - expected) <= 0.01;
}

function normalizeAccount(raw: unknown) {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function accountMatches(actual: string, expected: string) {
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  if (actual.length >= 4 && expected.length >= 4) {
    return actual.slice(-4) === expected.slice(-4);
  }
  return false;
}

function withinMinutes(fromIso: string, toIso: string, minutes: number) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return Math.abs(to - from) <= minutes * 60_000;
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = verifySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const userId = pickPrimaryUserId({
    authUserId: auth.user.id,
    accessibleUserIds: ownerIds,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unable to resolve user" }, { status: 400 });
  }

  const orderQuery = await admin
    .from("wallet_topup_orders")
    .select("id,user_id,status,base_amount_thb,unique_amount_thb,promptpay_target,expires_at,created_at,paid_at")
    .eq("id", parsed.data.topupOrderId)
    .in("user_id", ownerIds)
    .maybeSingle();
  if (orderQuery.error) {
    return NextResponse.json({ error: orderQuery.error.message }, { status: 400 });
  }
  if (!orderQuery.data) {
    return NextResponse.json({ error: "Topup order not found" }, { status: 404 });
  }
  const order = orderQuery.data as TopupOrderRow;

  if (order.status === "paid") {
    return NextResponse.json({ verified: true, alreadyPaid: true });
  }

  const nowIso = new Date().toISOString();
  if (new Date(order.expires_at).getTime() < Date.now()) {
    await admin.from("wallet_topup_orders").update({ status: "expired", updated_at: nowIso }).eq("id", order.id);
    return NextResponse.json({ error: "Topup order expired" }, { status: 409 });
  }

  const submission = {
    slipImageUrl: parsed.data.slipImageUrl ?? null,
    rawPayload: parsed.data.rawPayload ?? {},
    reference: parsed.data.reference ?? null,
    amountThb: parsed.data.amountThb ?? null,
    receiverAccount: parsed.data.receiverAccount ?? null,
    payerAccount: parsed.data.payerAccount ?? null,
    payerName: parsed.data.payerName ?? null,
    transferredAt: parsed.data.transferredAt ?? null,
  };

  const requireProvider = String(process.env.PACKAGE_SLIP_REQUIRE_PROVIDER ?? "1").trim() !== "0";
  if (requireProvider && !isPaymentSlipProviderConfigured()) {
    return NextResponse.json({ error: "Payment slip provider is not configured" }, { status: 503 });
  }

  const providerResult = await verifyPackageSlipWithProvider({
    provider: parsed.data.provider ?? "manual",
    order: {
      id: order.id,
      planId: "wallet_topup",
      cycle: "monthly",
      uniqueAmountThb: Number(order.unique_amount_thb),
      promptpayTarget: order.promptpay_target,
    },
    submission,
  });

  const minConfidenceRaw = Number(process.env.PACKAGE_SLIP_MIN_CONFIDENCE ?? 0.9);
  const minConfidence = Number.isFinite(minConfidenceRaw) ? Math.max(0, Math.min(1, minConfidenceRaw)) : 0.9;
  const maxSubmitDelayMinutesRaw = Number(process.env.PACKAGE_SLIP_SUBMIT_MAX_DELAY_MINUTES ?? 20);
  const maxSubmitDelayMinutes = Number.isFinite(maxSubmitDelayMinutesRaw)
    ? Math.min(180, Math.max(1, Math.floor(maxSubmitDelayMinutesRaw)))
    : 20;

  const expectedAmount = Number(order.unique_amount_thb);
  const amount = providerResult.amountThb ?? submission.amountThb ?? null;
  const receiverAccount = normalizeAccount(providerResult.receiverAccount ?? submission.receiverAccount ?? "");
  const expectedReceiver = normalizeAccount(order.promptpay_target);
  const transferredAt = providerResult.transferredAt ?? submission.transferredAt ?? null;
  const reference = String(providerResult.reference ?? submission.reference ?? "").trim();
  const provider = String(providerResult.providerName ?? "manual").trim().slice(0, 40) || "manual";

  const amountMatched = amount !== null ? closeAmount(Number(amount), expectedAmount) : false;
  const receiverMatched = accountMatches(receiverAccount, expectedReceiver);
  const submitTimeMatched = transferredAt ? withinMinutes(new Date().toISOString(), transferredAt, maxSubmitDelayMinutes) : false;
  const orderDate = toDateKeyInTimezone(order.created_at, "Asia/Bangkok");
  const transferDate = transferredAt ? toDateKeyInTimezone(transferredAt, "Asia/Bangkok") : "";
  const transferDateMatched = Boolean(orderDate && transferDate && orderDate === transferDate);
  const providerMatched = requireProvider ? providerResult.providerVerified && providerResult.ok : providerResult.ok;
  const providerConfidenceMatched =
    providerResult.confidenceScore === null ? !requireProvider : Number(providerResult.confidenceScore) >= minConfidence;
  const providerFraudMatched = providerResult.suspicious === null ? !requireProvider : providerResult.suspicious === false;
  const matched =
    amountMatched &&
    receiverMatched &&
    submitTimeMatched &&
    transferDateMatched &&
    providerMatched &&
    providerConfidenceMatched &&
    providerFraudMatched;

  const noteParts: string[] = [];
  if (!amountMatched) noteParts.push("amount_mismatch");
  if (!receiverMatched) noteParts.push("receiver_mismatch");
  if (!submitTimeMatched) noteParts.push("submit_delay_mismatch");
  if (!transferDateMatched) noteParts.push("transfer_date_mismatch");
  if (!providerMatched) noteParts.push("provider_mismatch");
  if (!providerConfidenceMatched) noteParts.push("provider_confidence_mismatch");
  if (!providerFraudMatched) noteParts.push("provider_suspicious_detected");
  if (!reference) noteParts.push("missing_reference");

  const verificationStatus = matched ? "matched" : "mismatch";
  const slipInsert = await admin.from("wallet_topup_slips").insert({
    topup_order_id: order.id,
    user_id: userId,
    verification_status: verificationStatus,
    provider_name: provider,
    provider_reference: reference || null,
    amount_thb: amount !== null ? Number(amount) : null,
    payer_name: String(providerResult.payerName ?? submission.payerName ?? "").slice(0, 120) || null,
    payer_account: normalizeAccount(providerResult.payerAccount ?? submission.payerAccount ?? "") || null,
    receiver_account: receiverAccount || null,
    bank_name: String(providerResult.bankName ?? "").slice(0, 80) || null,
    transferred_at: transferredAt ? new Date(transferredAt).toISOString() : null,
    confidence_score: providerResult.confidenceScore !== null ? Number(providerResult.confidenceScore) : null,
    verification_note: noteParts.join(",") || null,
    raw_payload_json: { submission, providerResult },
    reviewed_at: nowIso,
  });
  if (slipInsert.error) {
    return NextResponse.json({ error: slipInsert.error.message }, { status: 400 });
  }

  if (!matched) {
    return NextResponse.json({ verified: false, reason: noteParts });
  }

  const topupNote = `topup_order:${order.id}`;
  const existingTxQuery = await admin
    .from("wallet_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("tx_type", "topup")
    .eq("note", topupNote)
    .maybeSingle();
  if (existingTxQuery.error) {
    return NextResponse.json({ error: existingTxQuery.error.message }, { status: 400 });
  }

  if (!existingTxQuery.data?.id) {
    try {
      await applyWalletTransaction({
        admin,
        userId,
        direction: "credit",
        amountThb: Number(order.base_amount_thb),
        txType: "topup",
        note: topupNote,
      });
    } catch (walletError) {
      return NextResponse.json({ error: String(walletError instanceof Error ? walletError.message : walletError) }, { status: 400 });
    }
  }

  await admin
    .from("wallet_topup_orders")
    .update({
      status: "paid",
      paid_at: nowIso,
      updated_at: nowIso,
      metadata_json: {
        paymentVerifiedAt: nowIso,
        provider,
      },
    })
    .eq("id", order.id)
    .in("status", ["pending", "paid"]);

  const balanceThb = await getWalletBalance(admin, userId);
  return NextResponse.json({
    verified: true,
    balanceThb,
  });
}
