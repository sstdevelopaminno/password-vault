import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { packageCheckoutSchema } from "@/lib/validators";
import { createPromptPayOrder, hasUsedTrialPlan, activatePackagePlan } from "@/lib/package-subscriptions";
import { getPlanConfig, resolvePlanForLocale } from "@/lib/package-plans";
import type { Locale } from "@/i18n/messages";

function parseLocale(value: string | null): Locale {
  return value === "en" ? "en" : "th";
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = packageCheckoutSchema.safeParse(payload);
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

  const plan = getPlanConfig(parsed.data.planId);
  if (!plan) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const locale = parseLocale(parsed.data.locale ?? null);

  if (plan.id === "free_pro_trial") {
    const alreadyUsed = await hasUsedTrialPlan(admin, userId, "free_pro_trial");
    if (alreadyUsed) {
      return NextResponse.json({ error: "Trial has already been used" }, { status: 409 });
    }

    const subscription = await activatePackagePlan({
      admin,
      userId,
      plan,
      cycle: null,
      status: "trialing",
      sourceOrderId: null,
    });

    return NextResponse.json({
      mode: "activated",
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cycle: subscription.cycle,
        startsAt: subscription.starts_at,
        endsAt: subscription.ends_at,
      },
      plan: resolvePlanForLocale(locale, plan),
    });
  }

  if (plan.isFree || plan.monthlyPriceThb <= 0) {
    const subscription = await activatePackagePlan({
      admin,
      userId,
      plan,
      cycle: null,
      status: "active",
      sourceOrderId: null,
    });
    return NextResponse.json({
      mode: "activated",
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cycle: subscription.cycle,
        startsAt: subscription.starts_at,
        endsAt: subscription.ends_at,
      },
      plan: resolvePlanForLocale(locale, plan),
    });
  }

  const promptPayTarget = String(process.env.PROMPTPAY_TARGET_PHONE ?? "").trim();
  if (!promptPayTarget) {
    return NextResponse.json({ error: "Missing PromptPay target configuration" }, { status: 500 });
  }

  const order = await createPromptPayOrder({
    admin,
    userId,
    planId: plan.id,
    cycle: parsed.data.cycle,
    promptPayTarget,
    expiresInMinutes: Number(process.env.PACKAGE_ORDER_EXPIRES_MINUTES ?? 20),
  });

  return NextResponse.json({
    mode: "payment_required",
    order: {
      id: order.id,
      planId: order.plan_id,
      cycle: order.cycle,
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
