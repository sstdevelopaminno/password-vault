import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { ensureStarterPlan, getCurrentPackageSubscription } from "@/lib/package-subscriptions";
import { getPlanConfig, resolvePlanForLocale } from "@/lib/package-plans";
import type { Locale } from "@/i18n/messages";

type UsageCounterRow = {
  user_id: string;
  vault_items_count: number | null;
  notes_count: number | null;
  file_bytes: number | null;
  updated_at: string;
};

function parseLocale(value: string | null): Locale {
  return value === "en" ? "en" : "th";
}

function toGbText(bytes: number | null) {
  const safe = Math.max(0, Number(bytes ?? 0));
  return Number((safe / (1024 * 1024 * 1024)).toFixed(2));
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const locale = parseLocale(searchParams.get("locale"));

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

  await ensureStarterPlan(admin, userId);
  const current = await getCurrentPackageSubscription(admin, userId);
  if (!current) {
    return NextResponse.json({ error: "Unable to resolve active package" }, { status: 500 });
  }

  const plan = getPlanConfig(current.plan_id);
  if (!plan) {
    return NextResponse.json({ error: "Package plan mapping is missing" }, { status: 500 });
  }

  const usageQuery = await admin
    .from("package_usage_counters")
    .select("user_id,vault_items_count,notes_count,file_bytes,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (usageQuery.error) {
    return NextResponse.json({ error: usageQuery.error.message }, { status: 400 });
  }

  const localizedPlan = resolvePlanForLocale(locale, plan);
  const usage = (usageQuery.data as UsageCounterRow | null) ?? null;

  return NextResponse.json({
    subscription: {
      id: current.id,
      status: current.status,
      cycle: current.cycle,
      startsAt: current.starts_at,
      endsAt: current.ends_at,
    },
    plan: localizedPlan,
    usage: {
      vaultItems: Number(usage?.vault_items_count ?? 0),
      notes: Number(usage?.notes_count ?? 0),
      filesGb: toGbText(usage?.file_bytes ?? 0),
      lastUpdatedAt: usage?.updated_at ?? null,
    },
  });
}

