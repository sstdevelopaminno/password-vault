import type { SupabaseClient } from "@supabase/supabase-js";

export type WalletApplyResult = {
  transactionId: string;
  balanceBeforeThb: number;
  balanceAfterThb: number;
};

function asAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

export async function ensureWalletAccount(admin: SupabaseClient, userId: string) {
  const existing = await admin
    .from("wallet_accounts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) {
    throw new Error(existing.error.message);
  }
  if (existing.data?.user_id) {
    return;
  }

  const inserted = await admin.from("wallet_accounts").insert({
    user_id: userId,
    balance_thb: 0,
    updated_at: new Date().toISOString(),
  });
  if (inserted.error) {
    throw new Error(inserted.error.message);
  }
}

export async function getWalletBalance(admin: SupabaseClient, userId: string) {
  const query = await admin
    .from("wallet_accounts")
    .select("balance_thb")
    .eq("user_id", userId)
    .maybeSingle();
  if (query.error) {
    throw new Error(query.error.message);
  }
  return asAmount(query.data?.balance_thb ?? 0);
}

export async function applyWalletTransaction(input: {
  admin: SupabaseClient;
  userId: string;
  direction: "credit" | "debit";
  amountThb: number;
  txType: "topup" | "package_purchase" | "refund" | "adjustment";
  refOrderId?: string | null;
  note?: string | null;
}) {
  const amount = asAmount(input.amountThb);
  if (amount <= 0) {
    throw new Error("wallet_invalid_amount");
  }

  const rpc = await input.admin.rpc("wallet_apply_transaction", {
    p_user_id: input.userId,
    p_direction: input.direction,
    p_amount_thb: amount,
    p_tx_type: input.txType,
    p_ref_order_id: input.refOrderId ?? null,
    p_note: input.note ?? null,
  });

  if (rpc.error) {
    throw new Error(rpc.error.message);
  }

  const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  if (!row) {
    throw new Error("wallet_apply_failed");
  }

  return {
    transactionId: String((row as { transaction_id?: string }).transaction_id ?? ""),
    balanceBeforeThb: asAmount((row as { balance_before_thb?: unknown }).balance_before_thb),
    balanceAfterThb: asAmount((row as { balance_after_thb?: unknown }).balance_after_thb),
  } satisfies WalletApplyResult;
}
