import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PACKAGE_PLANS, calcSavingsPercent, resolvePlanForLocale, type PackageCycle } from "@/lib/package-plans";
import type { Locale } from "@/i18n/messages";

type PlanRow = {
  id: string;
  display_order: number;
  is_free: boolean;
  trial_days: number | null;
  max_members: number;
  storage_gb: number;
  active: boolean;
};

type PlanPriceRow = {
  plan_id: string;
  cycle: PackageCycle;
  amount_thb: number | string;
  active: boolean;
};

function parseLocale(value: string | null): Locale {
  return value === "en" ? "en" : "th";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const locale = parseLocale(searchParams.get("locale"));
  const supabase = await createClient();

  const [planQuery, priceQuery] = await Promise.all([
    supabase
      .from("package_plans")
      .select("id,display_order,is_free,trial_days,max_members,storage_gb,active")
      .eq("active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("package_plan_prices")
      .select("plan_id,cycle,amount_thb,active")
      .eq("active", true),
  ]);

  const dbPlanMap = new Map<string, PlanRow>();
  const dbPriceMap = new Map<string, { monthly?: number; yearly?: number }>();

  if (!planQuery.error) {
    for (const row of (planQuery.data ?? []) as PlanRow[]) {
      dbPlanMap.set(row.id, row);
    }
  }

  if (!priceQuery.error) {
    for (const row of (priceQuery.data ?? []) as PlanPriceRow[]) {
      const key = row.plan_id;
      const current = dbPriceMap.get(key) ?? {};
      const amount = Number(row.amount_thb);
      if (row.cycle === "monthly") current.monthly = Number.isFinite(amount) ? amount : 0;
      if (row.cycle === "yearly") current.yearly = Number.isFinite(amount) ? amount : 0;
      dbPriceMap.set(key, current);
    }
  }

  const plans = PACKAGE_PLANS
    .map((plan) => {
      const localized = resolvePlanForLocale(locale, plan);
      const dbPlan = dbPlanMap.get(plan.id);
      const dbPrice = dbPriceMap.get(plan.id);
      const monthlyPriceThb = dbPrice?.monthly ?? localized.monthlyPriceThb;
      const yearlyPriceThb = dbPrice?.yearly ?? localized.yearlyPriceThb;
      const savingsPercent = calcSavingsPercent(monthlyPriceThb, yearlyPriceThb);

      return {
        ...localized,
        monthlyPriceThb,
        yearlyPriceThb,
        maxMembers: dbPlan?.max_members ?? localized.maxMembers,
        storageGb: dbPlan?.storage_gb ?? localized.storageGb,
        trialDays: dbPlan?.trial_days ?? localized.trialDays,
        isFree: dbPlan?.is_free ?? localized.isFree,
        savingsPercent,
      };
    })
    .sort((a, b) => a.order - b.order);

  return NextResponse.json(
    {
      locale,
      plans,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}

