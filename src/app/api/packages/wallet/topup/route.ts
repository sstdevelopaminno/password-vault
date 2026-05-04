import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { createWalletTopupOrder } from "@/lib/wallet-topup";
import { promptPayConfigErrorMessage, resolvePromptPayTargetFromEnv } from "@/lib/promptpay-config";

const topupSchema = z.object({
  amountThb: z.coerce.number().min(1).max(1_000_000),
});

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = topupSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid topup payload", issues: parsed.error.issues }, { status: 400 });
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

  const promptPayTarget = resolvePromptPayTargetFromEnv();
  if (!promptPayTarget) {
    return NextResponse.json({ error: promptPayConfigErrorMessage() }, { status: 500 });
  }

  const order = await createWalletTopupOrder({
    admin,
    userId,
    baseAmountThb: parsed.data.amountThb,
    promptPayTarget,
    expiresInMinutes: Number(process.env.WALLET_TOPUP_ORDER_EXPIRES_MINUTES ?? 30),
  });

  return NextResponse.json({
    mode: "payment_required",
    order: {
      id: order.id,
      status: order.status,
      baseAmountThb: order.base_amount_thb,
      uniqueAmountThb: order.unique_amount_thb,
      currency: order.currency,
      promptpayTarget: order.promptpay_target,
      promptpayQrUrl: order.promptpay_qr_url,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
    },
  });
}
