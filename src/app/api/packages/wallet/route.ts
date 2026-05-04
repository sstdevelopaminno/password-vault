import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { ensureWalletAccount, getWalletBalance } from "@/lib/wallet";

type WalletTxRow = {
  id: string;
  direction: "credit" | "debit";
  tx_type: "topup" | "package_purchase" | "refund" | "adjustment";
  amount_thb: number | string;
  balance_before_thb: number | string;
  balance_after_thb: number | string;
  ref_order_id: string | null;
  note: string | null;
  created_at: string;
};

function asAmount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function labelByType(row: WalletTxRow) {
  if (row.tx_type === "topup") return "Top up";
  if (row.tx_type === "refund") return "Refund";
  if (row.tx_type === "adjustment") return "Adjustment";
  return "Package payment";
}

export async function GET() {
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

  await ensureWalletAccount(admin, userId);
  const balanceThb = await getWalletBalance(admin, userId);

  const txQuery = await admin
    .from("wallet_transactions")
    .select("id,direction,tx_type,amount_thb,balance_before_thb,balance_after_thb,ref_order_id,note,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (txQuery.error) {
    return NextResponse.json({ error: txQuery.error.message }, { status: 400 });
  }

  const rows = (txQuery.data ?? []) as WalletTxRow[];
  const spentThb = rows
    .filter((row) => row.direction === "debit" && row.tx_type === "package_purchase")
    .reduce((sum, row) => sum + asAmount(row.amount_thb), 0);

  return NextResponse.json({
    balanceThb,
    spentThb: Number(spentThb.toFixed(2)),
    transactions: rows.map((row) => ({
      id: row.id,
      label: labelByType(row),
      direction: row.direction === "credit" ? "in" : "out",
      amountThb: asAmount(row.amount_thb),
      currency: "THB",
      status: "paid",
      paidAt: row.created_at,
      createdAt: row.created_at,
      balanceBeforeThb: asAmount(row.balance_before_thb),
      balanceAfterThb: asAmount(row.balance_after_thb),
      refOrderId: row.ref_order_id,
      note: row.note,
    })),
  });
}
