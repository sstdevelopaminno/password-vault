import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { resolvePlanForLocale } from "@/lib/package-plans";
import { collectPackageUsageSnapshot, resolveUserPackageAccess } from "@/lib/package-entitlements";
import type { Locale } from "@/i18n/messages";

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

  const currentAccess = await resolveUserPackageAccess({
    admin,
    userId,
  });
  const usage = await collectPackageUsageSnapshot({
    admin,
    userId,
    includeWorkspaceBytes: true,
  });

  const localizedPlan = resolvePlanForLocale(locale, currentAccess.plan);

  return NextResponse.json({
    subscription: {
      id: currentAccess.subscription.id,
      status: currentAccess.subscription.status,
      cycle: currentAccess.subscription.cycle,
      startsAt: currentAccess.subscription.starts_at,
      endsAt: currentAccess.subscription.ends_at,
    },
    plan: localizedPlan,
    usage: {
      vaultItems: usage.vaultItems,
      notes: usage.notes,
      filesGb: toGbText(usage.fileBytes),
      lastUpdatedAt: usage.updatedAt,
    },
  });
}

