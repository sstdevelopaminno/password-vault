import type { SupabaseClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { buildPromptPayQrUrl, getCycleAmount, getPlanConfig, type PackageCycle, type PackagePlanConfig, type PackagePlanId } from "@/lib/package-plans";

type SubscriptionStatus = "active" | "trialing" | "expired" | "canceled";

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  cycle: PackageCycle | null;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  plan_id: string;
  cycle: PackageCycle;
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

function addMonths(base: Date, months: number) {
  const next = new Date(base.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

function toIso(value: Date) {
  return value.toISOString();
}

function asNumber(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calcUniqueAmount(baseAmount: number) {
  const satang = randomInt(11, 99);
  return Number((baseAmount + satang / 100).toFixed(2));
}

function resolveEndsAt(input: { startsAt: Date; cycle: PackageCycle | null; trialDays: number | null }) {
  if (input.trialDays && input.trialDays > 0) {
    const endsAt = new Date(input.startsAt.getTime());
    endsAt.setDate(endsAt.getDate() + input.trialDays);
    return endsAt;
  }
  if (input.cycle === "monthly") return addMonths(input.startsAt, 1);
  if (input.cycle === "yearly") return addMonths(input.startsAt, 12);
  return null;
}

async function expireCurrentSubscriptions(admin: SupabaseClient, userId: string) {
  const now = new Date().toISOString();
  const update = await admin
    .from("package_subscriptions")
    .update({
      status: "expired",
      ends_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .in("status", ["active", "trialing"]);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

export async function getCurrentPackageSubscription(admin: SupabaseClient, userId: string) {
  const now = new Date().toISOString();
  const query = await admin
    .from("package_subscriptions")
    .select("id,user_id,plan_id,cycle,status,starts_at,ends_at,created_at")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (query.error) {
    throw new Error(query.error.message);
  }
  return (query.data as SubscriptionRow | null) ?? null;
}

export async function hasUsedTrialPlan(admin: SupabaseClient, userId: string, planId: PackagePlanId) {
  const query = await admin
    .from("package_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .limit(1)
    .maybeSingle();

  if (query.error) throw new Error(query.error.message);
  return Boolean(query.data?.id);
}

export async function activatePackagePlan(input: {
  admin: SupabaseClient;
  userId: string;
  plan: PackagePlanConfig;
  cycle: PackageCycle | null;
  status: SubscriptionStatus;
  sourceOrderId?: string | null;
}) {
  const now = new Date();
  const endsAt = resolveEndsAt({
    startsAt: now,
    cycle: input.cycle,
    trialDays: input.plan.trialDays,
  });

  await expireCurrentSubscriptions(input.admin, input.userId);

  const inserted = await input.admin
    .from("package_subscriptions")
    .insert({
      user_id: input.userId,
      plan_id: input.plan.id,
      cycle: input.cycle,
      status: input.status,
      starts_at: toIso(now),
      ends_at: endsAt ? toIso(endsAt) : null,
      source_order_id: input.sourceOrderId ?? null,
      updated_at: toIso(now),
    })
    .select("id,user_id,plan_id,cycle,status,starts_at,ends_at,created_at")
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message ?? "Failed to activate package");
  }

  return inserted.data as SubscriptionRow;
}

export async function ensureStarterPlan(admin: SupabaseClient, userId: string) {
  const current = await getCurrentPackageSubscription(admin, userId);
  if (current?.id) return current;

  const starter = getPlanConfig("free_starter");
  if (!starter) throw new Error("Starter package configuration is missing");

  return activatePackagePlan({
    admin,
    userId,
    plan: starter,
    cycle: null,
    status: "active",
  });
}

export async function createPromptPayOrder(input: {
  admin: SupabaseClient;
  userId: string;
  planId: PackagePlanId;
  cycle: PackageCycle;
  promptPayTarget: string;
  expiresInMinutes?: number;
}) {
  const plan = getPlanConfig(input.planId);
  if (!plan) {
    throw new Error("Package not found");
  }
  const baseAmount = getCycleAmount(plan, input.cycle);
  if (baseAmount <= 0) {
    throw new Error("Selected package does not require payment");
  }

  const uniqueAmount = calcUniqueAmount(baseAmount);
  const promptpayQrUrl = buildPromptPayQrUrl(input.promptPayTarget, uniqueAmount);
  if (!promptpayQrUrl) {
    throw new Error("PromptPay target is not configured");
  }

  const now = new Date();
  const expiresInMinutes = Number(input.expiresInMinutes ?? 20);
  const safeExpires = Number.isFinite(expiresInMinutes) ? Math.min(120, Math.max(5, Math.floor(expiresInMinutes))) : 20;
  const expiresAt = new Date(now.getTime() + safeExpires * 60_000);

  const insert = await input.admin
    .from("package_orders")
    .insert({
      user_id: input.userId,
      plan_id: plan.id,
      cycle: input.cycle,
      status: "pending",
      base_amount_thb: Number(baseAmount.toFixed(2)),
      unique_amount_thb: uniqueAmount,
      currency: "THB",
      promptpay_target: input.promptPayTarget,
      promptpay_qr_url: promptpayQrUrl,
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("id,user_id,plan_id,cycle,status,base_amount_thb,unique_amount_thb,currency,promptpay_target,promptpay_qr_url,expires_at,paid_at,created_at")
    .single();

  if (insert.error || !insert.data) {
    throw new Error(insert.error?.message ?? "Failed to create PromptPay order");
  }

  return {
    ...(insert.data as OrderRow),
    base_amount_thb: asNumber(insert.data.base_amount_thb),
    unique_amount_thb: asNumber(insert.data.unique_amount_thb),
  };
}

