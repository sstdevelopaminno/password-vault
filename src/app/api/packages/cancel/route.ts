import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrimaryUserId, resolveAccessibleUserIds } from "@/lib/user-identity";
import { activatePackagePlan } from "@/lib/package-subscriptions";
import { getPlanConfig } from "@/lib/package-plans";

export async function POST() {
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

  const starter = getPlanConfig("free_starter");
  if (!starter) {
    return NextResponse.json({ error: "Starter package configuration is missing" }, { status: 500 });
  }

  const subscription = await activatePackagePlan({
    admin,
    userId,
    plan: starter,
    cycle: null,
    status: "active",
    sourceOrderId: null,
  });

  return NextResponse.json({
    canceled: true,
    subscription: {
      id: subscription.id,
      status: subscription.status,
      cycle: subscription.cycle,
      startsAt: subscription.starts_at,
      endsAt: subscription.ends_at,
    },
  });
}

