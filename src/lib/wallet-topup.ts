import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPromptPayQrUrl } from "@/lib/package-plans";

export type WalletTopupOrderRow = {
  id: string;
  user_id: string;
  status: "pending" | "paid" | "expired" | "rejected";
  base_amount_thb: number | string;
  unique_amount_thb: number | string;
  currency: string;
  promptpay_target: string;
  promptpay_qr_url: string;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
};

function asAmount(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function calcUniqueAmount(baseAmount: number) {
  const satang = randomInt(11, 99);
  return Number((baseAmount + satang / 100).toFixed(2));
}

export async function createWalletTopupOrder(input: {
  admin: SupabaseClient;
  userId: string;
  baseAmountThb: number;
  promptPayTarget: string;
  expiresInMinutes?: number;
}) {
  const amount = Number(input.baseAmountThb);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid topup amount");
  }
  const baseAmount = Number(amount.toFixed(2));
  const uniqueAmount = calcUniqueAmount(baseAmount);
  const promptpayQrUrl = buildPromptPayQrUrl(input.promptPayTarget, uniqueAmount);
  if (!promptpayQrUrl) {
    throw new Error("PromptPay target is not configured");
  }

  const now = new Date();
  const expiresInMinutes = Number(input.expiresInMinutes ?? 30);
  const safeExpires = Number.isFinite(expiresInMinutes) ? Math.min(180, Math.max(5, Math.floor(expiresInMinutes))) : 30;
  const expiresAt = new Date(now.getTime() + safeExpires * 60_000);

  const insert = await input.admin
    .from("wallet_topup_orders")
    .insert({
      user_id: input.userId,
      status: "pending",
      base_amount_thb: baseAmount,
      unique_amount_thb: uniqueAmount,
      currency: "THB",
      promptpay_target: input.promptPayTarget,
      promptpay_qr_url: promptpayQrUrl,
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("id,user_id,status,base_amount_thb,unique_amount_thb,currency,promptpay_target,promptpay_qr_url,expires_at,paid_at,created_at")
    .single();

  if (insert.error || !insert.data) {
    throw new Error(insert.error?.message ?? "Failed to create topup order");
  }

  return {
    ...(insert.data as WalletTopupOrderRow),
    base_amount_thb: asAmount(insert.data.base_amount_thb),
    unique_amount_thb: asAmount(insert.data.unique_amount_thb),
  };
}
