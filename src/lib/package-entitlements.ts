import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanConfig, type PackagePlanConfig, type PackagePlanId } from "@/lib/package-plans";
import { ensureStarterPlan, getCurrentPackageSubscription } from "@/lib/package-subscriptions";
import { WORKSPACE_FILES_BUCKET, buildFolderStoragePrefix } from "@/lib/workspace-cloud";

type ActiveSubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  cycle: "monthly" | "yearly" | null;
  status: "active" | "trialing" | "expired" | "canceled";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export type PackageEntitlements = {
  planId: PackagePlanId;
  maxMembers: number;
  vaultItemsLimit: number;
  notesLimit: number;
  storageLimitBytes: number;
  perUploadLimitBytes: number;
};

export type PackageUsageSnapshot = {
  vaultItems: number;
  notes: number;
  fileBytes: number;
  updatedAt: string;
};

export type ResolvedPackageAccess = {
  subscription: ActiveSubscriptionRow;
  plan: PackagePlanConfig;
  entitlements: PackageEntitlements;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

const ENTITLEMENTS_BY_PLAN: Record<PackagePlanId, Omit<PackageEntitlements, "planId" | "maxMembers">> = {
  free_starter: {
    vaultItemsLimit: 200,
    notesLimit: 200,
    storageLimitBytes: 100 * MB,
    perUploadLimitBytes: 10 * MB,
  },
  free_pro_trial: {
    vaultItemsLimit: 600,
    notesLimit: 600,
    storageLimitBytes: 500 * MB,
    perUploadLimitBytes: 25 * MB,
  },
  lite: {
    vaultItemsLimit: 2_000,
    notesLimit: 2_000,
    storageLimitBytes: 2 * GB,
    perUploadLimitBytes: 25 * MB,
  },
  pro: {
    vaultItemsLimit: 20_000,
    notesLimit: 20_000,
    storageLimitBytes: 10 * GB,
    perUploadLimitBytes: 100 * MB,
  },
  business: {
    vaultItemsLimit: 100_000,
    notesLimit: 100_000,
    storageLimitBytes: 60 * GB,
    perUploadLimitBytes: 250 * MB,
  },
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveEntitlementsForPlan(plan: PackagePlanConfig): PackageEntitlements {
  const mapped = ENTITLEMENTS_BY_PLAN[plan.id];
  return {
    planId: plan.id,
    maxMembers: Math.max(1, Number(plan.maxMembers ?? 1)),
    vaultItemsLimit: mapped.vaultItemsLimit,
    notesLimit: mapped.notesLimit,
    storageLimitBytes: mapped.storageLimitBytes,
    perUploadLimitBytes: mapped.perUploadLimitBytes,
  };
}

async function countWorkspaceOwnedStorageBytes(admin: SupabaseClient, userId: string) {
  const folderQuery = await admin.from("workspace_folders").select("id").eq("owner_user_id", userId);
  if (folderQuery.error) {
    const message = String(folderQuery.error.message ?? "").toLowerCase();
    if (message.includes("workspace_folders") || message.includes("does not exist") || message.includes("relation")) {
      return 0;
    }
    throw new Error(folderQuery.error.message);
  }

  const folderIds = (folderQuery.data ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  if (folderIds.length === 0) return 0;

  let totalBytes = 0;
  for (const folderId of folderIds) {
    const prefix = buildFolderStoragePrefix(folderId);
    let offset = 0;

    while (true) {
      const listed = await admin.storage.from(WORKSPACE_FILES_BUCKET).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (listed.error) {
        const message = String(listed.error.message ?? "").toLowerCase();
        if (message.includes("not found") || message.includes("does not exist")) {
          return 0;
        }
        throw new Error(listed.error.message);
      }

      const entries = listed.data ?? [];
      for (const item of entries) {
        totalBytes += asNumber(item.metadata?.size);
      }

      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  return totalBytes;
}

export async function collectPackageUsageSnapshot(input: {
  admin: SupabaseClient;
  userId: string;
  includeWorkspaceBytes?: boolean;
}) {
  const [vaultQuery, notesQuery, usageQuery] = await Promise.all([
    input.admin.from("vault_items").select("id", { count: "exact", head: true }).eq("owner_user_id", input.userId),
    input.admin.from("notes").select("id", { count: "exact", head: true }).eq("user_id", input.userId),
    input.admin
      .from("package_usage_counters")
      .select("file_bytes")
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);

  if (vaultQuery.error) throw new Error(vaultQuery.error.message);
  if (notesQuery.error) throw new Error(notesQuery.error.message);
  if (usageQuery.error) throw new Error(usageQuery.error.message);

  let fileBytes = asNumber(usageQuery.data?.file_bytes);
  if (input.includeWorkspaceBytes) {
    fileBytes = await countWorkspaceOwnedStorageBytes(input.admin, input.userId);
  }

  const usage: PackageUsageSnapshot = {
    vaultItems: asNumber(vaultQuery.count),
    notes: asNumber(notesQuery.count),
    fileBytes,
    updatedAt: new Date().toISOString(),
  };

  await upsertPackageUsageCounters({
    admin: input.admin,
    userId: input.userId,
    usage,
  });

  return usage;
}

export async function upsertPackageUsageCounters(input: {
  admin: SupabaseClient;
  userId: string;
  usage: PackageUsageSnapshot;
}) {
  const upsert = await input.admin.from("package_usage_counters").upsert(
    {
      user_id: input.userId,
      vault_items_count: input.usage.vaultItems,
      notes_count: input.usage.notes,
      file_bytes: input.usage.fileBytes,
      updated_at: input.usage.updatedAt,
    },
    { onConflict: "user_id" },
  );

  if (upsert.error) {
    throw new Error(upsert.error.message);
  }
}

export async function resolveUserPackageAccess(input: { admin: SupabaseClient; userId: string }) {
  await ensureStarterPlan(input.admin, input.userId);
  const current = await getCurrentPackageSubscription(input.admin, input.userId);
  if (!current) {
    throw new Error("Unable to resolve active package");
  }

  const plan = getPlanConfig(current.plan_id);
  if (!plan) {
    throw new Error("Package plan mapping is missing");
  }

  return {
    subscription: current as ActiveSubscriptionRow,
    plan,
    entitlements: resolveEntitlementsForPlan(plan),
  } satisfies ResolvedPackageAccess;
}

export async function assertVaultItemQuota(input: { admin: SupabaseClient; userId: string }) {
  const access = await resolveUserPackageAccess({ admin: input.admin, userId: input.userId });
  const usage = await collectPackageUsageSnapshot({
    admin: input.admin,
    userId: input.userId,
    includeWorkspaceBytes: false,
  });
  if (usage.vaultItems >= access.entitlements.vaultItemsLimit) {
    throw new Error(`Package limit reached: max ${access.entitlements.vaultItemsLimit} vault items`);
  }
  return { access, usage };
}

export async function assertNotesQuota(input: { admin: SupabaseClient; userId: string }) {
  const access = await resolveUserPackageAccess({ admin: input.admin, userId: input.userId });
  const usage = await collectPackageUsageSnapshot({
    admin: input.admin,
    userId: input.userId,
    includeWorkspaceBytes: false,
  });
  if (usage.notes >= access.entitlements.notesLimit) {
    throw new Error(`Package limit reached: max ${access.entitlements.notesLimit} notes`);
  }
  return { access, usage };
}

export async function assertWorkspaceUploadQuota(input: {
  admin: SupabaseClient;
  userId: string;
  uploadBytes: number;
}) {
  const access = await resolveUserPackageAccess({ admin: input.admin, userId: input.userId });

  if (input.uploadBytes > access.entitlements.perUploadLimitBytes) {
    throw new Error(
      `Package limit reached: max upload size is ${Math.floor(access.entitlements.perUploadLimitBytes / MB)} MB`,
    );
  }

  const usage = await collectPackageUsageSnapshot({
    admin: input.admin,
    userId: input.userId,
    includeWorkspaceBytes: true,
  });

  if (usage.fileBytes + input.uploadBytes > access.entitlements.storageLimitBytes) {
    throw new Error(
      `Package limit reached: total file storage is ${Math.floor(access.entitlements.storageLimitBytes / MB)} MB`,
    );
  }

  return { access, usage };
}

export async function assertMemberQuota(input: {
  admin: SupabaseClient;
  userId: string;
  currentMemberCount: number;
}) {
  const access = await resolveUserPackageAccess({ admin: input.admin, userId: input.userId });
  if (input.currentMemberCount >= access.entitlements.maxMembers) {
    throw new Error(`Package limit reached: max ${access.entitlements.maxMembers} team members`);
  }
  return access;
}
